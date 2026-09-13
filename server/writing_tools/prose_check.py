from __future__ import annotations

import statistics
import threading
from bisect import bisect_right
from collections import Counter
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Callable

import spacy
from proselint.config import Config
from proselint.tools import LintFile
from spacy.tokens import Doc, Span, Token

PARSER_MODEL = "en_core_web_sm"
_LOCK = threading.Lock()
_PARSER: spacy.Language | None = None


def _parser() -> spacy.Language:
    global _PARSER
    if _PARSER is None:
        _PARSER = spacy.load(PARSER_MODEL, exclude=["ner"])
    return _PARSER


@dataclass(frozen=True)
class Place:
    line: int
    character: int


@dataclass(frozen=True)
class Finding:
    rule: str
    kind: str
    message: str
    detail: str
    at: Place
    end: Place
    related: tuple[tuple[Place, Place], ...] = field(default=())
    replacements: tuple[str, ...] = field(default=())


class Passage:
    def __init__(self, prose: Iterable[tuple[int, str]]) -> None:
        lines = list(prose)
        self._lines = [index for index, _ in lines]
        self._starts: list[int] = []
        at = 0
        for _, line in lines:
            self._starts.append(at)
            at += len(line) + 1
        self.text = "\n".join(line for _, line in lines)

    def place(self, offset: int) -> Place:
        index = max(0, bisect_right(self._starts, offset) - 1)
        return Place(self._lines[index], offset - self._starts[index])

    def span(self, at: int, end: int) -> tuple[Place, Place]:
        return self.place(at), self.place(end)

    def line_spans(self) -> list[tuple[int, int]]:
        ends = [start - 1 for start in self._starts[1:]] + [len(self.text)]
        return list(zip(self._starts, ends))


FILTERS = frozenset(
    {
        "see", "hear", "feel", "notice", "realize", "realise", "watch",
        "think", "wonder", "remember", "decide", "know", "observe", "perceive",
    }
)
BOOKISMS = frozenset(
    {
        "exclaim", "retort", "growl", "hiss", "bark", "snarl", "sneer",
        "gasp", "breathe", "purr", "drawl", "interject", "opine", "declare",
        "expostulate", "ejaculate",
    }
)
UNSPEAKABLE = frozenset(
    {"chuckle", "laugh", "smile", "grin", "shrug", "nod", "frown", "sigh", "wince"}
)

TAGS = frozenset(
    {"say", "ask", "reply", "answer", "whisper", "shout", "murmur", "mutter", "call"}
)

QUOTES = '"“”'

ECHO_REACH = 400
ECHO_SHORTEST = 4
MONOTONY_RUN = 5
MONOTONY_SPREAD = 2.5
SHORTEST_MONOTONOUS_SENTENCE = 5
CRUTCH_LEAST = 8
CRUTCH_TIMES_MEDIAN = 4.0
CRUTCH_MOST = 5
ENOUGH_WORDS_TO_JUDGE = 20

CONTENT = frozenset({"NOUN", "VERB", "ADJ", "ADV"})


def _filter_words(doc: Doc, passage: Passage) -> Iterator[Finding]:
    for token in doc:
        if token.pos_ != "VERB" or token.lemma_.lower() not in FILTERS:
            continue
        perceiver = next(
            (child for child in token.children if child.dep_ == "nsubj"), None
        )
        if perceiver is None or perceiver.pos_ not in {"PRON", "PROPN"}:
            continue
        at, end = passage.span(token.idx, token.idx + len(token.text))
        yield Finding(
            rule="filter-word",
            kind="style",
            message=f"“{token.text}” reports rather than shows",
            detail=(
                f"“{perceiver.text} {token.text}…” tells the reader that the "
                "point-of-view character perceived something, and only then what "
                "it was. The perceiving is almost never the news. Cutting the "
                "verb usually leaves the sentence saying the same thing from "
                "closer in — “she saw the door was open” is “the door was open”."
            ),
            at=at,
            end=end,
        )


def _said_bookisms(doc: Doc, passage: Passage) -> Iterator[Finding]:
    for sentence in doc.sents:
        if not any(quote in sentence.text for quote in QUOTES):
            continue
        for token in sentence:
            if token.pos_ != "VERB":
                continue
            lemma = token.lemma_.lower()
            at, end = passage.span(token.idx, token.idx + len(token.text))
            if lemma in UNSPEAKABLE:
                yield Finding(
                    rule="said-bookism",
                    kind="style",
                    message=f"speech cannot be {token.text}ed",
                    detail=(
                        f"“{token.text}” is something a person does, not a way of "
                        "producing words — you cannot chuckle a sentence any more "
                        "than you can nod one. If the action matters, give it its "
                        "own sentence beside the line; if it does not, “said” "
                        "carries the speech and disappears."
                    ),
                    at=at,
                    end=end,
                )
            elif lemma in BOOKISMS:
                yield Finding(
                    rule="said-bookism",
                    kind="style",
                    message=f"“{token.text}” asks to be noticed",
                    detail=(
                        "A tag's job is to say who spoke and then get out of the "
                        f"way. “Said” is invisible; “{token.text}” is not, and the "
                        "reader looks at the tag instead of the line. If the "
                        "delivery is not already in the words, the words are what "
                        "needs the work."
                    ),
                    at=at,
                    end=end,
                )


def _adverbial_tags(doc: Doc, passage: Passage) -> Iterator[Finding]:
    for token in doc:
        if token.pos_ != "ADV" or not token.text.lower().endswith("ly"):
            continue
        head = token.head
        if head.pos_ != "VERB" or head.lemma_.lower() not in TAGS:
            continue
        if not any(quote in token.sent.text for quote in QUOTES):
            continue
        at, end = passage.span(token.idx, token.idx + len(token.text))
        yield Finding(
            rule="adverbial-tag",
            kind="style",
            message=f"“{head.text} {token.text}” explains the line",
            detail=(
                f"“{token.text}” tells the reader how to hear the speech, which "
                "means the speech is not doing it. It is also the one place an "
                "adverb has nowhere to hide: it sits beside the tag, where the "
                "reader is already skimming. Either the line carries the feeling "
                "or the beat around it does."
            ),
            at=at,
            end=end,
        )


def _passive_voice(doc: Doc, passage: Passage) -> Iterator[Finding]:
    for token in doc:
        if token.dep_ != "nsubjpass":
            continue
        verb = token.head
        parts = [verb] + [
            child for child in verb.children if child.dep_ in {"auxpass", "aux"}
        ]
        first = min(part.idx for part in parts)
        last = max(part.idx + len(part.text) for part in parts)
        at, end = passage.span(first, last)
        yield Finding(
            rule="passive",
            kind="style",
            message="the subject is being acted on",
            detail=(
                f"“{doc.text[first:last]}” puts the thing that was done before "
                "whoever did it, and sometimes leaves them out altogether. In "
                "narrative that usually costs the sentence its actor, and with it "
                "the momentum. It is right when the doer genuinely does not "
                "matter, or when not knowing who acted is the point."
            ),
            at=at,
            end=end,
        )


def _echo(doc: Doc, passage: Passage) -> Iterator[Finding]:
    said_before: dict[str, Token] = {}
    for token in doc:
        if token.pos_ not in CONTENT or token.is_stop:
            continue
        lemma = token.lemma_.lower()
        if len(lemma) < ECHO_SHORTEST:
            continue
        earlier = said_before.get(lemma)
        if earlier is not None and token.idx - earlier.idx <= ECHO_REACH:
            at, end = passage.span(token.idx, token.idx + len(token.text))
            yield Finding(
                rule="echo",
                kind="style",
                message=f"“{token.text}” again",
                detail=(
                    f"“{earlier.text}” appears just above and “{token.text}” here. "
                    "A word repeated within a few lines is heard as an echo "
                    "rather than as emphasis — the reader notices the writing "
                    "instead of the scene. Deliberate repetition works, but it "
                    "has to be close enough together to read as a decision."
                ),
                at=at,
                end=end,
                related=(passage.span(earlier.idx, earlier.idx + len(earlier.text)),),
            )
        said_before[lemma] = token


def _openings(doc: Doc, passage: Passage) -> Iterator[Finding]:
    opener_before: Token | None = None
    for sentence in doc.sents:
        opener = next(
            (token for token in sentence if not token.is_punct and not token.is_space),
            None,
        )
        if opener is None:
            continue
        if opener_before is not None and opener.lemma_.lower() == opener_before.lemma_.lower():
            at, end = passage.span(opener.idx, opener.idx + len(opener.text))
            yield Finding(
                rule="opening",
                kind="style",
                message=f"another sentence opening on “{opener.text}”",
                detail=(
                    "Two sentences in a row starting with the same word give the "
                    "passage a pulse the reader hears before they hear the "
                    "meaning. Three make it a list. Varying where a sentence "
                    "starts — with the object, with a clause, with the action — "
                    "is usually all it takes."
                ),
                at=at,
                end=end,
                related=(
                    passage.span(
                        opener_before.idx, opener_before.idx + len(opener_before.text)
                    ),
                ),
            )
        opener_before = opener


def _monotony(doc: Doc, passage: Passage) -> Iterator[Finding]:
    sentences_with_words: list[Span] = [
        sentence for sentence in doc.sents if any(not t.is_punct for t in sentence)
    ]
    word_counts = [
        len([token for token in sentence if not token.is_punct])
        for sentence in sentences_with_words
    ]

    index = 0
    while index + MONOTONY_RUN <= len(sentences_with_words):
        run = word_counts[index : index + MONOTONY_RUN]
        long_enough_to_drag = min(run) >= SHORTEST_MONOTONOUS_SENTENCE
        if long_enough_to_drag and statistics.pstdev(run) <= MONOTONY_SPREAD:
            last = sentences_with_words[index + MONOTONY_RUN - 1]
            at, end = passage.span(last.start_char, last.end_char)
            yield Finding(
                rule="monotony",
                kind="style",
                message=f"{MONOTONY_RUN} sentences of the same length",
                detail=(
                    "The last five sentences are all about "
                    f"{round(statistics.fmean(run))} words long. Sentence "
                    "length is where prose gets its pace: a run of equal ones "
                    "reads as flat however good each of them is. One short "
                    "sentence in the middle of them is usually the whole fix."
                ),
                at=at,
                end=end,
            )
            index += MONOTONY_RUN
        else:
            index += 1


def _crutches(doc: Doc, passage: Passage, worn: frozenset[str]) -> Iterator[Finding]:
    for token in doc:
        if token.pos_ not in CONTENT or token.lemma_.lower() not in worn:
            continue
        at, end = passage.span(token.idx, token.idx + len(token.text))
        yield Finding(
            rule="crutch",
            kind="style",
            message=f"“{token.text}” is a habit of this manuscript",
            detail=(
                f"“{token.lemma_}” appears far more often in this document than "
                "any other word of its kind. Every writer has a handful of these "
                "and cannot hear them — they are invisible from inside the "
                "sentence and obvious across a book. Not wrong here; worth "
                "knowing you reach for it."
            ),
            at=at,
            end=end,
        )


ABOUT_WORDS_BEING_WRONG = (
    "cliches", "lexical_illusions", "malapropisms", "mixed_metaphors",
    "mondegreens", "nonwords", "oxymorons", "redundancy", "spelling",
    "uncomparables",
)
ABOUT_PROSE_BEING_UNBUSINESSLIKE = (
    "annotations", "archaism", "dates_times", "hedging", "industrial_language",
    "misc", "needless_variants", "psychology", "restricted", "skunked_terms",
    "social_awareness", "terms", "typography", "weasel_words",
)

USAGE_CHECKS = {
    **{check: True for check in ABOUT_WORDS_BEING_WRONG},
    **{check: False for check in ABOUT_PROSE_BEING_UNBUSINESSLIKE},
}

USAGE_CONFIG: Config = {"max_errors": 200, "checks": USAGE_CHECKS}

USAGE_RULE_PREFIX = "usage:"

_NEWLINE_LINTFILE_PREPENDS = 1


def _usage(passage: Passage) -> Iterator[Finding]:
    for found, _ in LintFile("passage", passage.text).lint(USAGE_CONFIG):
        first = found.span[0] - _NEWLINE_LINTFILE_PREPENDS
        last = found.span[1] - _NEWLINE_LINTFILE_PREPENDS
        if first < 0 or last <= first:
            continue
        at, end = passage.span(first, last)
        replacements = tuple(found.replacements) if found.replacements else ()
        yield Finding(
            rule=f"{USAGE_RULE_PREFIX}{found.check_path}",
            kind="usage",
            message=found.message.strip().rstrip("."),
            detail=(
                f"{found.message.strip()}\n\nFound by proselint's "
                f"“{found.check_path}” rule, which reads usage guides rather than "
                "the story — so it is worth ignoring wherever the words are a "
                "character's and not the narrator's."
            ),
            at=at,
            end=end,
            replacements=replacements,
        )


RULES: dict[str, Callable[[Doc, Passage], Iterator[Finding]]] = {
    "filter-word": _filter_words,
    "said-bookism": _said_bookisms,
    "adverbial-tag": _adverbial_tags,
    "passive": _passive_voice,
    "echo": _echo,
    "opening": _openings,
    "monotony": _monotony,
}


def sentences(text: str) -> list[tuple[int, int]]:
    if not text.strip():
        return []
    with _LOCK:
        doc = _parser()(text)
        return [
            (sentence.start_char, sentence.end_char)
            for sentence in doc.sents
            if sentence.text.strip()
        ]


def crutch_lemmas(prose: Iterable[tuple[int, str]]) -> frozenset[str]:
    with _LOCK:
        doc = _parser()(Passage(prose).text)
        counts = Counter(
            token.lemma_.lower()
            for token in doc
            if token.pos_ in CONTENT and not token.is_stop and len(token.lemma_) > 3
        )
    if len(counts) < ENOUGH_WORDS_TO_JUDGE:
        return frozenset()
    middle = statistics.median(counts.values())
    worn_out = [
        lemma
        for lemma, count in counts.most_common()
        if count >= CRUTCH_LEAST and count >= middle * CRUTCH_TIMES_MEDIAN
    ]
    return frozenset(worn_out[:CRUTCH_MOST])


def check(
    prose: Iterable[tuple[int, str]], crutches: frozenset[str] = frozenset()
) -> list[Finding]:
    passage = Passage(prose)
    if not passage.text.strip():
        return []

    with _LOCK:
        doc = _parser()(passage.text)
        found = [
            finding for rule in RULES.values() for finding in rule(doc, passage)
        ]
        if crutches:
            found.extend(_crutches(doc, passage, crutches))

    found.extend(_usage(passage))

    return sorted(found, key=lambda f: (f.at.line, f.at.character))

