"""Grammar, a sentence at a time, by asking a model to write each one properly.

The model is a minimal-edit corrector: it is trained to change as little as will
make a sentence grammatical, which is why it can be pointed at a novel at all. An
instruction-following editor asked to "fix the grammar" gives an editor's opinion
and rewrites the prose; this one puts a comma in.

What comes back is a *sentence*, and what the author needs is a *word*. So the
two are diffed and each run of changed words becomes its own mark — the author
takes the comma without swallowing four other opinions, and the underline sits
under the fault rather than under the paragraph.

Quotation marks are hidden from it too, blanked to spaces before the sentence
goes out. It learned from essays, which have almost no dialogue in them, so a
sentence opening on a quote reads to it as a sentence with a stray character at
the front: it deletes the opening mark and puts a space before the closing one,
every time. Blanking keeps the length, so every offset it reports is still an
offset into the sentence as the author wrote it — and whether the quotes
themselves are right is a question for the rules, which can see them.

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
# long is a paragraph somebody wrote without full stops. Short is short: cutting
# at the quotation marks leaves a great many two-word dialogue tags, and "she
# said" is prose the author wrote and can misspell like any other.
SHORTEST = 8
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

# Quotation marks that can only be one end of a pair, so a sentence beginning
# with a closer or ending with an opener is holding somebody else's.
_CLOSERS = "”’»"
_OPENERS = "“‘«"

# The marks that can only be quotation, and never an apostrophe. `'` and `’` are
# left out on purpose: they are apostrophes as often as they are quotes, and a
# missing one is a real fault worth saying so about.
_QUOTES = re.compile(r'["“”«»]')

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


def _trimmed(text: str, at: int, end: int) -> tuple[int, int]:
    """The sentence without the quotation marks belonging to its neighbours.

    A full stop inside dialogue ends the sentence before the quotation mark does,
    so the mark falls to the head of the next one — which then opens on a quote
    it never closes, and the model quite rightly says the quote is not needed. It
    is simply not this sentence's quote.

    Only ever narrows, so every offset taken afterwards is still an offset into
    the passage.
    """
    while at < end and (text[at].isspace() or text[at] in _CLOSERS):
        at += 1
    while end > at and (text[end - 1].isspace() or text[end - 1] in _OPENERS):
        end -= 1
    # A straight quote is neither an opener nor a closer, so it is an orphan only
    # when the sentence holds an odd number of them.
    if text[at:end].count('"') % 2:
        if at < end and text[at] == '"':
            at += 1
        elif end > at and text[end - 1] == '"':
            end -= 1
    while at < end and text[at].isspace():
        at += 1
    while end > at and text[end - 1].isspace():
        end -= 1
    return at, end


def _cuts(passage: Passage) -> list[int]:
    """Places a sentence can never run through.

    Two of them, and a segmenter reading the words alone knows about neither.

    A line break is one. The blank lines between paragraphs are gone before a
    passage is built, so three paragraphs arrive as three lines — and dialogue
    routinely ends without a full stop ("...35 million users"), which leaves the
    parser nothing to break on and runs the lot together into one sentence.

    A quotation mark is the other. What is inside one is somebody speaking and
    what is outside is somebody describing them; they are never one sentence,
    whatever the punctuation between them does. Cutting at every mark rather
    than pairing them up means an unclosed quote costs nothing.
    """
    cuts = {0, len(passage.text)}
    for at, end in passage.line_spans():
        cuts.add(at)
        cuts.add(end)
    for mark in _QUOTES.finditer(passage.text):
        cuts.add(mark.start())
        cuts.add(mark.end())
    return sorted(cuts)


def _segments(passage: Passage) -> list[tuple[int, int]]:
    """The runs of the passage worth asking about, one at a time.

    The parser says where the sentences are and the cuts say where they may not
    reach; what comes out is the finer of the two.

    The parser is shown the passage with its quotation marks blanked to spaces.
    A quotation glues what is inside it into a single sentence however many full
    stops it holds — «"No. Not once in ten years."» comes back whole — and
    without the marks the stops inside are stops like any other. Blanking keeps
    the length, so every offset it reports is an offset into the real passage.
    """
    plain = _QUOTES.sub(" ", passage.text)
    cuts = _cuts(passage)
    out: list[tuple[int, int]] = []
    for at, end in sentences(plain):
        inside = [cut for cut in cuts if at < cut < end]
        for first, last in zip([at, *inside], [*inside, end]):
            first, last = _trimmed(passage.text, first, last)
            if SHORTEST <= last - first <= LONGEST and _WORD.search(
                passage.text[first:last]
            ):
                out.append((first, last))
    return out


def _typography(text: str) -> str:
    """The text with its spacing, its dashes and its quotation marks set aside.

    Two runs that read the same once those are gone differ only in how they were
    typed, and the model has no standing there.

    Each is a place it was trained to be wrong about a novel. It learned from
    people who meant to write a compound word, so it closes up every spaced dash
    it sees. And it learned from essays, which have almost no dialogue in them,
    so a sentence that opens on a quotation mark reads to it as a sentence with a
    stray character at the front — it deletes the opening quote and puts a space
    in front of the closing one.
    """
    return _DASH.sub("-", _QUOTES.sub("", "".join(text.split())))


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

    spans = _segments(passage)
    if not spans:
        return []

    out, back = _masking(protect)
    found: list[Finding] = []

    for at, end in spans:
        original = passage.text[at:end]
        # Blanked rather than removed, so that what comes back is measured
        # against a sentence of the same length and in the same places.
        asked = _QUOTES.sub(" ", original)
        answered = model.complete("", _swapped(asked, out), CORRECTION_TOKENS)
        corrected = _swapped(answered.strip(), back)
        if not corrected or corrected == asked:
            continue

        edits = [
            (first, last, now)
            for first, last, now in _edits(asked, corrected)
            if _typography(asked[first:last]) != _typography(now)
            # A segment cut out of the middle of a line starts lower case, and
            # the model puts a capital on everything it is handed. That is the
            # cut speaking, not the author.
            and not (first == 0 and asked[first:last].lower() == now.lower())
        ]
        if not edits:
            continue

        # What the sentence would read as, with the author's quotation marks
        # still in it. The model was never shown them and has nothing to say
        # about them, so they are not its to take out.
        reads = original
        for first, last, now in reversed(edits):
            reads = reads[:first] + now + reads[last:]

        for first, last, now in edits:
            was = original[first:last]
            rule, message = _named(was, now)
            found.append(
                Finding(
                    rule=f"grammar:{rule}",
                    kind="grammar",
                    message=message,
                    detail=(
                        f"As written:\n\n{original}\n\n"
                        f"As it would read:\n\n{reads}"
                    ),
                    at=passage.place(at + first),
                    end=passage.place(at + last),
                    replacements=(now,),
                )
            )
    return found
