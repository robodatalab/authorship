from dataclasses import dataclass
from pathlib import Path
import unittest

from server.api import ENCODER_MODEL, ENCODER_MODEL_GB
from roost import EncoderModel, InferenceModelResourceManager
from server.manuscript import Manuscript
from server.semantic_search import SearchIndex

MANUSCRIPT = Path(__file__).parents[2] / "data" / "story_2.md"
PASSAGES_PER_SEARCH = 10


@dataclass(frozen=True)
class Query:
    phrase: str
    answers: tuple[str, ...]


@dataclass
class Accuracy:
    found: float
    first: float
    missed: list[str]


VERBATIM = [
    Query(
        "the little bell attached to his caged genitals chimed softly",
        ("the little bell attached to his caged genitals chimed softly",),
    ),
    Query(
        "Your safeword with us for this session will be Peach",
        ("Your safeword with us for this session will be",),
    ),
    Query(
        "the premium commission just to secure his contract",
        ("the premium commission just to secure his contract",),
    ),
    Query(
        "She had just accepted an offer from a prestigious law firm",
        ("She had just accepted an offer from a prestigious law firm",),
    ),
    Query(
        "absolute fury, and beneath the anger, a profound, desperate terror",
        ("absolute fury, and beneath the anger, a profound, desperate terror",),
    ),
    Query("It's my Companion's name", ("It's my Companion's name",)),
    Query(
        "She cut their amount of sleep to four hours",
        ("She cut their amount of sleep to four hours",),
    ),
    Query(
        "you will need to carve out at least 2 hours a day",
        ("you will need to carve out at least 2 hours a day",),
    ),
    Query(
        "By 4 am, both of them, exhausted, went to bed",
        ("By 4 am, both of them, exhausted, went to bed",),
    ),
    Query(
        "Leveling was rarer than almost any crime, and punished more heavily than most",
        ("Leveling was rarer than almost any crime",),
    ),
    Query(
        "a red welt bloomed across his backside",
        ("a red welt bloomed across his backside",),
    ),
    Query(
        "I will not and cannot stand between a love like yours",
        ("I will not and cannot stand between a love like yours",),
    ),
]

PARAPHRASED = [
    Query(
        "the bell on his cage rang softly when he strained",
        ("the little bell attached to his caged genitals chimed softly",),
    ),
    Query(
        "the word that would stop the session was the name of a fruit",
        ("Your safeword with us for this session will be",),
    ),
    Query(
        "the fee to contract him cost about as much as a new carriage",
        ("the premium commission just to secure his contract",),
    ),
    Query(
        "she had landed a position at a well regarded legal practice",
        ("She had just accepted an offer from a prestigious law firm",),
    ),
    Query(
        "for a moment her face turned furious and frightened before she hid it",
        ("absolute fury, and beneath the anger, a profound, desperate terror",),
    ),
    Query(
        "the man she loves is her own servant",
        ("It's my Companion's name",),
    ),
    Query(
        "she reduced how long her servants were allowed to sleep",
        ("She cut their amount of sleep to four hours",),
    ),
    Query(
        "he needs a couple of hours of exercise every day",
        ("you will need to carve out at least 2 hours a day",),
    ),
    Query(
        "they talked into the small hours and finally slept",
        ("By 4 am, both of them, exhausted, went to bed",),
    ),
    Query(
        "treating a servant as an equal is punished more harshly than most crimes",
        ("Leveling was rarer than almost any crime",),
    ),
    Query(
        "she took a whip to the man in the frame and raised marks on his skin",
        ("a red welt bloomed across his backside",),
    ),
    Query(
        "she tells Sophia to take her Companion and go",
        ("I will not and cannot stand between a love like yours",),
    ),
]

ASKED = [
    Query(
        "what makes a sound when the Companion strains against his cage?",
        ("the little bell attached to his caged genitals chimed softly",),
    ),
    Query(
        "what safeword did Anabelle give the man?",
        ("Your safeword with us for this session will be",),
    ),
    Query(
        "how much does the pleasure Companion cost?",
        ("the premium commission just to secure his contract",),
    ),
    Query(
        "what job is Anabelle about to start?",
        ("She had just accepted an offer from a prestigious law firm",),
    ),
    Query(
        "when does Sophia's cheerful mask slip?",
        ("absolute fury, and beneath the anger, a profound, desperate terror",),
    ),
    Query("who is Sophia in love with?", ("It's my Companion's name",)),
    Query(
        "how much sleep do Anabelle's Companions get?",
        ("She cut their amount of sleep to four hours",),
    ),
    Query(
        "how long each day must the new Companion exercise?",
        ("you will need to carve out at least 2 hours a day",),
    ),
    Query(
        "what time did Anabelle and Sophia go to bed?",
        ("By 4 am, both of them, exhausted, went to bed",),
    ),
    Query(
        "what is the punishment for making a man your equal?",
        ("Leveling was rarer than almost any crime",),
    ),
    Query(
        "what does Anabelle do to the Companion after she hears about Mathew?",
        ("a red welt bloomed across his backside",),
    ),
    Query(
        "how does it end between Anabelle and Sophia?",
        ("I will not and cannot stand between a love like yours",),
    ),
]

CONCEPTUAL = [
    Query(
        "keeping a Companion aroused and confined",
        (
            "the little bell attached to his caged genitals chimed softly",
            "The chastity belt held him aching and snug",
        ),
    ),
    Query(
        "agreeing the limits of the session before it begins",
        (
            "I draw the line at body piercing",
            "Those terms are perfectly satisfactory",
        ),
    ),
    Query(
        "weighing whether a luxury is worth what it costs",
        ("the premium commission just to secure his contract",),
    ),
    Query(
        "years of study finally paying off",
        (
            "She had just accepted an offer from a prestigious law firm",
            "the years spent devouring endless books and memorizing complex regulations",
        ),
    ),
    Query(
        "Sophia hiding something painful behind a bright disposition",
        (
            "absolute fury, and beneath the anger, a profound, desperate terror",
            "an unfamiliar quietude settled deep within Sophia",
            "smile went entirely rigid",
        ),
    ),
    Query(
        "a woman confessing that she loves a servant as an equal",
        ("It's my Companion's name", "as the rest of it poured out of Sophia"),
    ),
    Query(
        "the regime Anabelle runs her household by",
        (
            "She cut their amount of sleep to four hours",
            "she enrolled in the efficiency course for her extracurricular score",
        ),
    ),
    Query(
        "what upkeep a pleasure Companion needs",
        (
            "you will need to carve out at least 2 hours a day",
            "The frame kept him supple and clean on its own",
        ),
    ),
    Query(
        "a long night of talking after everything came apart",
        (
            "By 4 am, both of them, exhausted, went to bed",
            "The ladies stayed talking through the night",
        ),
    ),
    Query(
        "the duty of a lawyer set against the woman she loves",
        (
            "Leveling was rarer than almost any crime",
            "As an officer of the law she had one clear duty",
            "And yet the thought of doing it turned her stomach worse than the crime itself",
        ),
    ),
    Query(
        "a rage with nowhere to go, taken out on a servant",
        (
            "a red welt bloomed across his backside",
            "an outlet for a fury that had nowhere else to go",
            "She hated every man in this cursed frame",
        ),
    ),
    Query(
        "letting go of the person you love",
        (
            "I will not and cannot stand between a love like yours",
            "Take your Companion and leave",
            "And then she was gone",
        ),
    ),
]

# Starting floors, to be moved to whatever the first run measures. They are the
# regression line, not the target: what the benchmark is for is the gradient
# between them.
VERBATIM_FLOOR = 0.9
PARAPHRASED_FLOOR = 0.8
ASKED_FLOOR = 0.8
CONCEPTUAL_FLOOR = 0.8


def line_of(lines: list[str], answer: str) -> int:
    matching = [number for number, line in enumerate(lines) if answer in line]
    if len(matching) != 1:
        raise AssertionError(
            f"{answer!r} is on {len(matching)} lines of the manuscript, not one"
        )
    return matching[0]


def accuracy(
    index: SearchIndex, encoder: EncoderModel, story: Manuscript, queries: list[Query]
) -> Accuracy:
    lines = story.lines
    found = 0
    first = 0
    missed = []

    for query in queries:
        wanted = {line_of(lines, answer) for answer in query.answers}
        passages = index.search(
            encoder, story, query.phrase, PASSAGES_PER_SEARCH
        ).passages
        answering = [
            passage
            for passage in passages
            if wanted & set(range(passage.first_line, passage.last_line + 1))
        ]
        best = max(passages, key=lambda passage: passage.similarity, default=None)

        found += bool(answering)
        first += best is not None and best in answering
        if not answering:
            missed.append(query.phrase)

    return Accuracy(found / len(queries), first / len(queries), missed)


def report(difficulty: str, measured: Accuracy) -> None:
    print(f"\n{difficulty:12} found {measured.found:.0%}  first {measured.first:.0%}")
    for phrase in measured.missed:
        print(f"{'':12} missed: {phrase}")


class SearchAccuracy(unittest.TestCase):

    story: Manuscript
    models: InferenceModelResourceManager
    encoder: EncoderModel
    index: SearchIndex

    @classmethod
    def setUpClass(cls) -> None:
        cls.story = Manuscript.load(MANUSCRIPT)
        cls.models = InferenceModelResourceManager(ENCODER_MODEL_GB)
        cls.encoder = EncoderModel(ENCODER_MODEL, cls.models, ENCODER_MODEL_GB)
        cls.index = SearchIndex()
        cls.index.encode_manuscript(cls.encoder, cls.story)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.models.shutdown()

    def test_a_phrase_lifted_from_the_manuscript_finds_its_line(self) -> None:
        measured = accuracy(self.index, self.encoder, self.story, VERBATIM)

        report("verbatim", measured)

        self.assertGreaterEqual(measured.found, VERBATIM_FLOOR)

    def test_a_paraphrase_finds_the_line_it_restates(self) -> None:
        measured = accuracy(self.index, self.encoder, self.story, PARAPHRASED)

        report("paraphrased", measured)

        self.assertGreaterEqual(measured.found, PARAPHRASED_FLOOR)

    def test_a_question_finds_the_line_that_answers_it(self) -> None:
        measured = accuracy(self.index, self.encoder, self.story, ASKED)

        report("asked", measured)

        self.assertGreaterEqual(measured.found, ASKED_FLOOR)

    def test_a_concept_finds_the_passage_that_carries_it(self) -> None:
        measured = accuracy(self.index, self.encoder, self.story, CONCEPTUAL)

        report("conceptual", measured)

        self.assertGreaterEqual(measured.found, CONCEPTUAL_FLOOR)


if __name__ == "__main__":
    unittest.main()
