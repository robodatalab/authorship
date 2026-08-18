"""Grammar, a sentence at a time, by asking a model to write each one properly.

The model is a minimal-edit corrector: it is trained to change as little as will
make a sentence grammatical, which is why it can be pointed at a novel at all. An
instruction-following editor asked to "fix the grammar" gives an editor's opinion
and rewrites the prose; this one puts a comma in.

What comes back is a *sentence*, and what the author needs is a *word*. So the
two are diffed and each run of changed words becomes its own mark — the author
takes the comma without swallowing four other opinions, and the underline sits
under the fault rather than under the paragraph.

Names are hidden from it first. An invented name is a run of word-pieces the
model has never seen sitting in a grammatical slot, which is the shape of a typo
— so every one of them would come back "corrected". They go out as ordinary
names and are put back afterwards.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from vramen import Seq2SeqModel

from server.writing_tools.prose_check import Finding, Passage, sentences

# What the model was trained to answer to. Not an instruction — the prefix *is*
# the task, and anything else in front of the sentence is read as part of it.
GEC_PREFIX = "gec: "

# A sentence's correction is a sentence; a budget past that is a budget for
# inventing one.
CORRECTION_TOKENS = 128

# Nothing useful comes of asking about a fragment of a word, and a sentence this
# long is a paragraph somebody wrote without full stops.
SHORTEST = 12
LONGEST = 400

# Names the model knows, to stand in for the ones it does not. Ordinary and
# unambiguous, and names rather than placeholders, so the grammar around them is
# the grammar that was written — `NAME1` would be corrected around rather than
# left alone.
STAND_INS = (
    "John", "Mary", "Peter", "Sarah", "Thomas", "Alice", "James", "Emma",
    "Robert", "Laura", "Henry", "Clara", "William", "Grace", "Edward", "Ruth",
)

_PIECE = re.compile(r"\S+|\s+")
_WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")
_NAME = re.compile(r"^[A-Z][a-z'’-]+$")
_DASH = re.compile(r"[-–—‑]")

# Capitalised and not a name: the days, the months, the word one calls oneself,
# and the handful that open sentences often enough to be caught anyway.
NOT_NAMES = frozenset(
    {
        "I", "The", "A", "An", "But", "And", "He", "She", "It", "They", "We",
        "You", "There", "This", "That", "His", "Her", "Their", "My", "Monday",
        "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
        "January", "February", "March", "April", "May", "June", "July",
        "August", "September", "October", "November", "December", "Mr", "Mrs",
        "Ms", "Dr",
    }
)


def gec_prompt(instruction: str, text: str) -> str:
    """What this model is asked with, which is a prefix rather than a request."""
    return f"{GEC_PREFIX}{text}"


def names_in(text: str) -> list[str]:
    """The words this document treats as names.

    Capitalised where the capital is not owed to the full stop before it.
    Cheaper than asking a model which words are entities, and better on a novel:
    the names most in need of protecting are the ones no entity recogniser has
    ever met.
    """
    found: set[str] = set()
    for at, end in sentences(text):
        opening = True
        for word in _WORD.finditer(text[at:end]):
            said = word.group()
            if not opening and _NAME.match(said) and said not in NOT_NAMES:
                found.add(said)
            opening = False
    return sorted(found)


def _masking(names: list[str]) -> tuple[dict[str, str], dict[str, str]]:
    """Each name and the ordinary one that goes out in its place, both ways.

    More names than stand-ins is a long book; the ones past the end go as
    themselves rather than as each other.
    """
    out: dict[str, str] = {}
    back: dict[str, str] = {}
    for name, stand_in in zip(names, STAND_INS):
        out[name] = stand_in
        back[stand_in] = name
    return out, back


def _swapped(text: str, using: dict[str, str]) -> str:
    if not using:
        return text
    return _WORD.sub(lambda word: using.get(word.group(), word.group()), text)


def _edits(before: str, after: str) -> list[tuple[int, int, str]]:
    """Where the two differ, by whole words, in the offsets of the first.

    Words and not characters: an edit beginning in the middle of one is an
    underline the author cannot read and a correction they cannot judge.
    """
    was = _PIECE.findall(before)
    now = _PIECE.findall(after)

    starts: list[int] = []
    at = 0
    for piece in was:
        starts.append(at)
        at += len(piece)
    starts.append(at)

    found: list[tuple[int, int, str]] = []
    for what, first, last, other_first, other_last in SequenceMatcher(
        None, was, now, autojunk=False
    ).get_opcodes():
        if what == "equal":
            continue
        at = starts[min(first, len(starts) - 1)]
        end = starts[min(last, len(starts) - 1)]
        inserted = "".join(now[other_first:other_last])
        if at == end:
            # An insertion covers nothing of its own, so it is drawn on the word
            # it would come after — and has to carry that word with it, or
            # putting it in would take the word out.
            at = max(0, at - 1)
            inserted = before[at:end] + inserted
        found.append((at, end, inserted))
    return found


def _typography(text: str) -> str:
    """The text with its spacing and its dashes set aside.

    Two runs that read the same once those are gone differ only in how they were
    typed, and the model has no standing there. It was trained on people who
    meant to write a compound word, so it closes up every spaced dash it sees —
    but a dash with air around it is a novelist's punctuation, and joining the
    words on either side of one is not a correction.
    """
    return _DASH.sub("-", "".join(text.split()))


def _named(was: str, now: str) -> tuple[str, str]:
    """What sort of change this is, and how to say it."""
    if not was.strip():
        return "insertion", f"“{now.strip()}” is missing here"
    if not now.strip():
        return "deletion", f"“{was.strip()}” is not needed"
    if not _WORD.search(was + now):
        return "punctuation", "the punctuation here is wrong"
    return "wording", f"“{was.strip()}” should be “{now.strip()}”"


def check(
    model: Seq2SeqModel, prose: list[tuple[int, str]], protect: list[str]
) -> list[Finding]:
    """Every word the model would have written differently.

    `protect` is the names to hide, worked out over the whole document rather
    than over this passage — a name is still a name in a chapter it never
    appears in.

    One sentence to a call for now. They are independent of each other and would
    go through in one pass together, but that is the model wrapper's to offer.
    """
    passage = Passage(prose)
    if not passage.text.strip():
        return []

    spans = [
        (at, end)
        for at, end in sentences(passage.text)
        if SHORTEST <= end - at <= LONGEST
    ]
    if not spans:
        return []

    out, back = _masking(protect)
    found: list[Finding] = []

    for at, end in spans:
        original = passage.text[at:end]
        answered = model.complete("", _swapped(original, out), CORRECTION_TOKENS)
        corrected = _swapped(answered.strip(), back)
        if not corrected or corrected == original:
            continue

        for first, last, now in _edits(original, corrected):
            was = original[first:last]
            # Spacing and dashes are the author's, not the model's.
            if _typography(was) == _typography(now):
                continue
            rule, message = _named(was, now)
            found.append(
                Finding(
                    rule=f"grammar:{rule}",
                    kind="grammar",
                    message=message,
                    detail=(
                        f"As written:\n\n{original}\n\n"
                        f"As it would read:\n\n{corrected}"
                    ),
                    at=passage.place(at + first),
                    end=passage.place(at + last),
                    replacements=(now,),
                )
            )
    return found
