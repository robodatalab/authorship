"""What is wrong with a passage of a novel, and why.

Every rule here answers about *fiction*, which is why they are written rather
than taken from a prose linter. A usage linter is built for people trying to
write standard English and failing; a novelist breaks it on purpose, and a tool
that cannot tell the difference spends its day underlining craft. So there is
nothing here about clichés, hedging or archaism — in dialogue those are
characterisation — and everything here is about the distance between the reader
and the scene.

A rule flags. It does not rewrite. What it produces is a span, a name for what is
wrong, and a sentence saying why, which is the only part the author cannot work
out for themselves. Because the fault has a name, the same rule can be asked
again about a proposed fix, which is what `fires` is for.

The parse comes from spaCy, so a rule can ask what a word *is* rather than what
it looks like: "felt" as a verb of perception is a filter, "felt" as the cloth is
a hat.
"""

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

MODEL = "en_core_web_sm"

# One parser, and one passage through it at a time. A parse is milliseconds and
# the jobs run on a thread pool, so waiting for the one in front is cheaper than
# the question of whether a pipeline may be shared.
_LOCK = threading.Lock()
_NLP: spacy.Language | None = None


def _nlp() -> spacy.Language:
    global _NLP
    if _NLP is None:
        # Entities are the one thing no rule here asks about.
        _NLP = spacy.load(MODEL, exclude=["ner"])
    return _NLP


@dataclass(frozen=True)
class Place:
    """Somewhere in the file, which is how the server says where anything is."""

    line: int
    character: int


@dataclass(frozen=True)
class Finding:
    """One thing wrong, and everywhere it is wrong.

    `kind` is what colour it is drawn in and `rule` is what it is — the first is
    for the reader of the underline, the second for whatever has to act on it.
    `related` is the rest of the same fault: an echo is a pair, and an underline
    under one half of it says nothing.
    """

    rule: str
    kind: str
    message: str
    detail: str
    at: Place
    end: Place
    related: tuple[tuple[Place, Place], ...] = field(default=())
    # What could go there instead, when the rule that found the fault already
    # knows. A fault with a replacement needs no model to put it right.
    replacements: tuple[str, ...] = field(default=())


class Passage:
    """The prose as one string, and where each character of it is in the file.

    The rules want sentences, and sentences run across the lines a file is
    written in — so the passage is parsed whole and every offset is put back
    afterwards.
    """

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


# --- the rules -------------------------------------------------------------


# Verbs of perceiving and of thinking. Said of the point-of-view character they
# report the scene instead of rendering it, which is the one distance an author
# almost never means to put there.
FILTERS = frozenset(
    {
        "see", "hear", "feel", "notice", "realize", "realise", "watch",
        "think", "wonder", "remember", "decide", "know", "observe", "perceive",
    }
)

# Dialogue tags that ask to be noticed. "Said" disappears; these do not.
BOOKISMS = frozenset(
    {
        "exclaim", "retort", "growl", "hiss", "bark", "snarl", "sneer",
        "gasp", "breathe", "purr", "drawl", "interject", "opine", "declare",
        "expostulate", "ejaculate",
    }
)

# The same fault with a second thing wrong: nobody can chuckle a sentence.
UNSPEAKABLE = frozenset(
    {"chuckle", "laugh", "smile", "grin", "shrug", "nod", "frown", "sigh", "wince"}
)

# The verbs a tag is built on, for the adverb that should not be leaning on them.
TAGS = frozenset(
    {"say", "ask", "reply", "answer", "whisper", "shout", "murmur", "mutter", "call"}
)

QUOTES = '"“”'

# What an echo is heard across. Characters rather than sentences, because what
# the ear notices is nearness on the page.
ECHO_REACH = 400
ECHO_SHORTEST = 4

# A run this long with lengths this close together has stopped having a rhythm.
MONOTONY_RUN = 5
MONOTONY_SPREAD = 2.5

# A word has to be worn before it is a crutch, and only the worst few are worth
# saying — a page underlined everywhere says nothing.
CRUTCH_LEAST = 8
CRUTCH_TIMES_MEDIAN = 4.0
CRUTCH_MOST = 5

CONTENT = frozenset({"NOUN", "VERB", "ADJ", "ADV"})


def _filter_words(doc: Doc, passage: Passage) -> Iterator[Finding]:
    """A perception verb standing between the reader and what is perceived."""
    for token in doc:
        if token.pos_ != "VERB" or token.lemma_.lower() not in FILTERS:
            continue
        subject = next(
            (child for child in token.children if child.dep_ == "nsubj"), None
        )
        # Somebody has to be doing the perceiving for it to be a filter at all.
        if subject is None or subject.pos_ not in {"PRON", "PROPN"}:
            continue
        at, end = passage.span(token.idx, token.idx + len(token.text))
        yield Finding(
            rule="filter-word",
            kind="style",
            message=f"“{token.text}” reports rather than shows",
            detail=(
                f"“{subject.text} {token.text}…” tells the reader that the "
                "point-of-view character perceived something, and only then what "
                "it was. The perceiving is almost never the news. Cutting the "
                "verb usually leaves the sentence saying the same thing from "
                "closer in — “she saw the door was open” is “the door was open”."
            ),
            at=at,
            end=end,
        )


def _said_bookisms(doc: Doc, passage: Passage) -> Iterator[Finding]:
    """A dialogue tag doing work the line should be doing."""
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
    """An adverb propping up a dialogue tag."""
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
    """A sentence whose subject is having something done to it."""
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
    """A content word said twice inside the reader's hearing."""
    seen: dict[str, Token] = {}
    for token in doc:
        if token.pos_ not in CONTENT or token.is_stop:
            continue
        lemma = token.lemma_.lower()
        if len(lemma) < ECHO_SHORTEST:
            continue
        before = seen.get(lemma)
        if before is not None and token.idx - before.idx <= ECHO_REACH:
            at, end = passage.span(token.idx, token.idx + len(token.text))
            yield Finding(
                rule="echo",
                kind="style",
                message=f"“{token.text}” again",
                detail=(
                    f"“{before.text}” appears just above and “{token.text}” here. "
                    "A word repeated within a few lines is heard as an echo "
                    "rather than as emphasis — the reader notices the writing "
                    "instead of the scene. Deliberate repetition works, but it "
                    "has to be close enough together to read as a decision."
                ),
                at=at,
                end=end,
                related=(passage.span(before.idx, before.idx + len(before.text)),),
            )
        seen[lemma] = token


def _openings(doc: Doc, passage: Passage) -> Iterator[Finding]:
    """Consecutive sentences that begin the same way."""
    before: Token | None = None
    for sentence in doc.sents:
        first = next(
            (token for token in sentence if not token.is_punct and not token.is_space),
            None,
        )
        if first is None:
            continue
        if before is not None and first.lemma_.lower() == before.lemma_.lower():
            at, end = passage.span(first.idx, first.idx + len(first.text))
            yield Finding(
                rule="opening",
                kind="style",
                message=f"another sentence opening on “{first.text}”",
                detail=(
                    "Two sentences in a row starting with the same word give the "
                    "passage a pulse the reader hears before they hear the "
                    "meaning. Three make it a list. Varying where a sentence "
                    "starts — with the object, with a clause, with the action — "
                    "is usually all it takes."
                ),
                at=at,
                end=end,
                related=(passage.span(before.idx, before.idx + len(before.text)),),
            )
        before = first


def _monotony(doc: Doc, passage: Passage) -> Iterator[Finding]:
    """A run of sentences all of the same length."""
    sentences: list[Span] = [
        sentence for sentence in doc.sents if any(not t.is_punct for t in sentence)
    ]
    lengths = [
        len([token for token in sentence if not token.is_punct])
        for sentence in sentences
    ]

    index = 0
    while index + MONOTONY_RUN <= len(sentences):
        window = lengths[index : index + MONOTONY_RUN]
        # Very short sentences in a row are a rhythm rather than the lack of one.
        if min(window) > 4 and statistics.pstdev(window) <= MONOTONY_SPREAD:
            last = sentences[index + MONOTONY_RUN - 1]
            at, end = passage.span(last.start_char, last.end_char)
            yield Finding(
                rule="monotony",
                kind="style",
                message=f"{MONOTONY_RUN} sentences of the same length",
                detail=(
                    "The last five sentences are all about "
                    f"{round(statistics.fmean(window))} words long. Sentence "
                    "length is where prose gets its pace: a run of equal ones "
                    "reads as flat however good each of them is. One short "
                    "sentence in the middle of them is usually the whole fix."
                ),
                at=at,
                end=end,
            )
            # Said once about a run, not once for every window inside it.
            index += MONOTONY_RUN
        else:
            index += 1


def _crutches(doc: Doc, passage: Passage, worn: frozenset[str]) -> Iterator[Finding]:
    """A word this author leans on, wherever it turns up here."""
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


# --- usage, from proselint ------------------------------------------------
#
# A second opinion, and a borrowed one: proselint carries word lists nobody
# should be retyping — clichés, mixed metaphors, malapropisms, the redundancies.
#
# Most of it is switched off. It is a usage linter written for journalism and
# argument, and a novel is neither: hedging and weasel words are how a character
# talks, archaism is period voice, and typography is the author's own punctuation
# being argued with. What is left is the part that is about words being wrong
# rather than about prose being unbusinesslike.
USAGE_CHECKS = {
    "annotations": False,
    "archaism": False,
    "cliches": True,
    "dates_times": False,
    "hedging": False,
    "industrial_language": False,
    "lexical_illusions": True,
    "malapropisms": True,
    "misc": False,
    "mixed_metaphors": True,
    "mondegreens": True,
    "needless_variants": False,
    "nonwords": True,
    "oxymorons": True,
    "psychology": False,
    "redundancy": True,
    "restricted": False,
    "skunked_terms": False,
    "social_awareness": False,
    "spelling": True,
    "terms": False,
    "typography": False,
    "uncomparables": True,
    "weasel_words": False,
}

USAGE_CONFIG: Config = {"max_errors": 200, "checks": USAGE_CHECKS}

# proselint's own rule names, kept whole and prefixed so that what fires can
# always be traced back to what wrote it.
USAGE = "usage:"

# `LintFile` puts a newline in front of what it is given, so every offset it
# reports is one further along than the text the caller handed it.
_USAGE_OFFSET = 1


def _usage(passage: Passage) -> Iterator[Finding]:
    """What proselint makes of the passage, in this document's terms."""
    for found, _ in LintFile("passage", passage.text).lint(USAGE_CONFIG):
        first = found.span[0] - _USAGE_OFFSET
        last = found.span[1] - _USAGE_OFFSET
        if first < 0 or last <= first:
            continue
        at, end = passage.span(first, last)
        replacements = tuple(found.replacements) if found.replacements else ()
        yield Finding(
            rule=f"{USAGE}{found.check_path}",
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


# Every rule by the name its findings carry, so that what found a fault can be
# asked again about a proposed fix. Adding a rule here is the whole of adding it.
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
    """Where each sentence of the text begins and ends.

    From the parser rather than from the full stops. Dialogue ends on question
    marks and exclamation marks as often as on periods, and a period is as often
    an initial, an abbreviation or the middle of a number — a rule written by
    hand gets the first page of any novel wrong.
    """
    if not text.strip():
        return []
    with _LOCK:
        doc = _nlp()(text)
        return [
            (sentence.start_char, sentence.end_char)
            for sentence in doc.sents
            if sentence.text.strip()
        ]


def crutch_lemmas(prose: Iterable[tuple[int, str]]) -> frozenset[str]:
    """The words a whole manuscript leans on.

    Worked out over the document rather than the passage, because that is the
    only place the habit is visible — and it is why an editor holding the whole
    book can say something a checker in a text box never can.
    """
    with _LOCK:
        doc = _nlp()(Passage(prose).text)
        counts = Counter(
            token.lemma_.lower()
            for token in doc
            if token.pos_ in CONTENT and not token.is_stop and len(token.lemma_) > 3
        )
    if len(counts) < 20:
        return frozenset()
    middle = statistics.median(counts.values())
    worn = [
        lemma
        for lemma, count in counts.most_common()
        if count >= CRUTCH_LEAST and count >= middle * CRUTCH_TIMES_MEDIAN
    ]
    return frozenset(worn[:CRUTCH_MOST])


def check(
    prose: Iterable[tuple[int, str]], crutches: frozenset[str] = frozenset()
) -> list[Finding]:
    """Everything wrong with a passage, by every rule there is.

    `prose` is the lines and their numbers in the file — the same shape
    `Document.story_lines` yields, so what is checked is what is story and never
    the markers or the author's own notes.
    """
    passage = Passage(prose)
    if not passage.text.strip():
        return []

    with _LOCK:
        doc = _nlp()(passage.text)
        found = [
            finding for rule in RULES.values() for finding in rule(doc, passage)
        ]
        if crutches:
            found.extend(_crutches(doc, passage, crutches))

    # Outside the parser's lock: proselint reads the text and nothing else.
    found.extend(_usage(passage))

    return sorted(found, key=lambda f: (f.at.line, f.at.character))


def fires(
    rule: str, prose: Iterable[tuple[int, str]], line: int, at: int, end: int
) -> bool:
    """Whether that one rule still finds fault where a fix was put in.

    The point of a rule having a name. A model asked to put something right can
    be judged by the thing that found it, which a model asked to reread a
    paragraph never can.
    """
    passage = Passage(prose)
    if not passage.text.strip():
        return False

    def covers(finding: Finding) -> bool:
        return (
            finding.at.line == line
            and finding.at.character < end
            and finding.end.character > at
        )

    if rule.startswith(USAGE):
        return any(
            covers(finding) for finding in _usage(passage) if finding.rule == rule
        )

    found = RULES.get(rule)
    if found is None:
        return False
    with _LOCK:
        doc = _nlp()(passage.text)
        return any(covers(finding) for finding in found(doc, passage))
