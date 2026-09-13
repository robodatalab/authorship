from __future__ import annotations

import re
from difflib import SequenceMatcher

from vramen import Seq2SeqModel

from server.writing_tools.prose_check import Finding, Passage, sentences

GEC_PREFIX = "gec: "
CORRECTION_TOKENS = 128
SHORTEST_SENTENCE = 8
LONGEST_SENTENCE = 400
STAND_INS = (
    "John", "Mary", "Peter", "Sarah", "Thomas", "Alice", "James", "Emma",
    "Robert", "Laura", "Henry", "Clara", "William", "Grace", "Edward", "Ruth",
)

_WORD_OR_SPACE = re.compile(r"\S+|\s+")
_WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")
_NAME = re.compile(r"^[A-Z][a-z'’-]+$")
_DASH = re.compile(r"[-–—‑]")

_CLOSERS = "”’»"
_OPENERS = "“‘«"

_QUOTES = re.compile(r'["“”«»]')

_CAPITALISED = re.compile(r"[A-Z][A-Za-z'’-]*")

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


def gec_prompt(ignored_instruction: str, text: str) -> str:
    return f"{GEC_PREFIX}{text}"


def names_in(text: str) -> list[str]:
    names: set[str] = set()
    for at, end in sentences(text):
        first_word_of_the_sentence = True
        for found in _WORD.finditer(text[at:end]):
            word = found.group()
            capitalised_by_choice = (
                not first_word_of_the_sentence and _NAME.match(word)
            )
            if capitalised_by_choice and word not in NOT_NAMES:
                names.add(word)
            first_word_of_the_sentence = False
    return sorted(names)


def _name_disguises(names: list[str]) -> tuple[dict[str, str], dict[str, str]]:
    as_stand_ins: dict[str, str] = {}
    as_names: dict[str, str] = {}
    for name, stand_in in zip(names, STAND_INS):
        as_stand_ins[name] = stand_in
        as_names[stand_in] = name
    return as_stand_ins, as_names


def _with_words_swapped(text: str, swaps: dict[str, str]) -> str:
    if not swaps:
        return text
    return _WORD.sub(lambda word: swaps.get(word.group(), word.group()), text)


def _word_aligned_edits(before: str, after: str) -> list[tuple[int, int, str]]:
    before_pieces = _WORD_OR_SPACE.findall(before)
    after_pieces = _WORD_OR_SPACE.findall(after)

    piece_starts: list[int] = []
    at = 0
    for piece in before_pieces:
        piece_starts.append(at)
        at += len(piece)
    piece_starts.append(at)

    found: list[tuple[int, int, str]] = []
    for change, first_piece, last_piece, first_after, last_after in SequenceMatcher(
        None, before_pieces, after_pieces, autojunk=False
    ).get_opcodes():
        if change == "equal":
            continue
        at = piece_starts[min(first_piece, len(piece_starts) - 1)]
        end = piece_starts[min(last_piece, len(piece_starts) - 1)]
        replacement = "".join(after_pieces[first_after:last_after])
        an_insertion_covering_no_words = at == end
        if an_insertion_covering_no_words:
            at = max(0, at - 1)
            replacement = before[at:end] + replacement
        found.append((at, end, replacement))
    return found


def _trimmed_of_orphan_quotes(text: str, at: int, end: int) -> tuple[int, int]:
    while at < end and (text[at].isspace() or text[at] in _CLOSERS):
        at += 1
    while end > at and (text[end - 1].isspace() or text[end - 1] in _OPENERS):
        end -= 1
    an_unpaired_straight_quote = text[at:end].count('"') % 2
    if an_unpaired_straight_quote:
        if at < end and text[at] == '"':
            at += 1
        elif end > at and text[end - 1] == '"':
            end -= 1
    while at < end and text[at].isspace():
        at += 1
    while end > at and text[end - 1].isspace():
        end -= 1
    return at, end


def _places_a_sentence_cannot_cross(passage: Passage) -> list[int]:
    places = {0, len(passage.text)}
    for at, end in passage.line_spans():
        places.add(at)
        places.add(end)
    for mark in _QUOTES.finditer(passage.text):
        places.add(mark.start())
        places.add(mark.end())
    return sorted(places)


def _sentences_to_ask_about(passage: Passage) -> list[tuple[int, int]]:
    with_quotes_blanked = _QUOTES.sub(" ", passage.text)
    cannot_cross = _places_a_sentence_cannot_cross(passage)
    worth_asking: list[tuple[int, int]] = []
    for at, end in sentences(with_quotes_blanked):
        crossed = [place for place in cannot_cross if at < place < end]
        for first, last in zip([at, *crossed], [*crossed, end]):
            first, last = _trimmed_of_orphan_quotes(passage.text, first, last)
            long_enough_to_judge = (
                SHORTEST_SENTENCE <= last - first <= LONGEST_SENTENCE
            )
            if long_enough_to_judge and _WORD.search(passage.text[first:last]):
                worth_asking.append((first, last))
    return worth_asking


def _apart_from_typography(text: str) -> str:
    return _DASH.sub("-", _QUOTES.sub("", "".join(text.split())))


def _renames_somebody(was: str, now: str) -> bool:
    for found in _CAPITALISED.finditer(was):
        word = found.group()
        if word not in NOT_NAMES and word not in now:
            return True
    return False


def _capital_owed_to_the_cut(was: str, now: str, at: int) -> bool:
    return at == 0 and was.lower() == now.lower()


def _fault_named(was: str, now: str) -> tuple[str, str]:
    if not was.strip():
        return "insertion", f"“{now.strip()}” is missing here"
    if not now.strip():
        return "deletion", f"“{was.strip()}” is not needed"
    if not _WORD.search(was + now):
        return "punctuation", "the punctuation here is wrong"
    return "wording", f"“{was.strip()}” should be “{now.strip()}”"


def check(
    model: Seq2SeqModel, prose: list[tuple[int, str]], names_to_protect: list[str]
) -> list[Finding]:
    passage = Passage(prose)
    if not passage.text.strip():
        return []

    asking_about = _sentences_to_ask_about(passage)
    if not asking_about:
        return []

    as_stand_ins, as_names = _name_disguises(names_to_protect)
    found: list[Finding] = []

    for at, end in asking_about:
        original = passage.text[at:end]
        quotes_blanked = _QUOTES.sub(" ", original)
        answered = model.complete(
            "", _with_words_swapped(quotes_blanked, as_stand_ins), CORRECTION_TOKENS
        )
        corrected = _with_words_swapped(answered.strip(), as_names)
        if not corrected or corrected == quotes_blanked:
            continue

        edits = [
            (first, last, now)
            for first, last, now in _word_aligned_edits(quotes_blanked, corrected)
            if _apart_from_typography(quotes_blanked[first:last])
            != _apart_from_typography(now)
            and not _capital_owed_to_the_cut(quotes_blanked[first:last], now, first)
            and not _renames_somebody(quotes_blanked[first:last], now)
        ]
        if not edits:
            continue

        would_read = original
        for first, last, now in reversed(edits):
            would_read = would_read[:first] + now + would_read[last:]

        for first, last, now in edits:
            was = original[first:last]
            rule, message = _fault_named(was, now)
            found.append(
                Finding(
                    rule=f"grammar:{rule}",
                    kind="grammar",
                    message=message,
                    detail=(
                        f"As written:\n\n{original}\n\n"
                        f"As it would read:\n\n{would_read}"
                    ),
                    at=passage.place(at + first),
                    end=passage.place(at + last),
                    replacements=(now,),
                )
            )
    return found
