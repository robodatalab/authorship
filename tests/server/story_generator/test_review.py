import random
import unittest
from unittest.mock import patch

from parameterized import parameterized
from server.story_generator.review import TerminalReview


class TerminalReviewAsk(unittest.TestCase):
    @parameterized.expand(
        [
            ("nothing_typed", [""], ""),
            ("one_line_typed", ["Motherhood", ""], "Motherhood"),
            ("lines_typed", ["Motherhood", "War", ""], "Motherhood\nWar"),
        ]
    )
    def test_answer_is_the_lines_typed_until_an_empty_line(self, _, typed: list[str], expected_answer: str) -> None:
        # Confident enough that every result would pass unreviewed.
        chance = random.Random(0)
        reviews = TerminalReview(1.0, chance)

        with patch("builtins.input", side_effect=typed):
            answer = reviews.ask("Which concepts should the story be about?")

        self.assertEqual(answer, expected_answer)
