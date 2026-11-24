import asyncio
import unittest
from unittest import mock

from server.writing_tools import grammar_check


def checked(*arguments: object, **named: object) -> list:
    return asyncio.run(grammar_check.check(*arguments, **named))


def build_fake_model(answers: dict[str, str]) -> mock.MagicMock:
    """A model that answers by lookup, and answers with the question otherwise."""
    model = mock.MagicMock()
    model.rewrite = mock.AsyncMock(
        side_effect=lambda text, max_new_tokens: answers.get(
            text.removeprefix(grammar_check.GEC_PREFIX),
            text.removeprefix(grammar_check.GEC_PREFIX),
        )
    )
    return model


def lines(text: str) -> list[tuple[int, str]]:
    return list(enumerate(text.split("\n")))


class Renaming(unittest.TestCase):
    def test_a_capitalised_word_swapped_for_another_is_a_rename(self) -> None:
        self.assertTrue(grammar_check._renames_somebody("Henry ", "Avenue "))

    def test_an_invented_name_swapped_for_a_word_is_a_rename(self) -> None:
        self.assertTrue(grammar_check._renames_somebody("Kaelith", "Kenneth"))

    def test_a_name_left_where_it_was_is_not_a_rename(self) -> None:
        self.assertFalse(grammar_check._renames_somebody("Diane leaned", "Diane leant"))

    def test_a_lower_case_correction_is_not_a_rename(self) -> None:
        self.assertFalse(grammar_check._renames_somebody("their", "there"))

    def test_a_sentence_opener_is_not_a_name(self) -> None:
        self.assertFalse(grammar_check._renames_somebody("The door", "A door"))

    def test_a_pronoun_is_not_a_name(self) -> None:
        self.assertFalse(grammar_check._renames_somebody("She was", "He was"))

    def test_a_month_is_not_a_name(self) -> None:
        self.assertFalse(grammar_check._renames_somebody("August was", "April was"))

    def test_a_name_among_words_that_change_is_still_protected(self) -> None:
        self.assertTrue(grammar_check._renames_somebody("Kendra who sat", "Kendrick that sat"))

    def test_a_correction_around_a_name_is_allowed(self) -> None:
        self.assertFalse(grammar_check._renames_somebody("Kendra who sat", "Kendra that sat"))

    def test_capitalising_a_lower_case_word_is_not_a_rename(self) -> None:
        self.assertFalse(grammar_check._renames_somebody("henry was", "Henry was"))

    def test_check_does_not_report_a_renamed_character(self) -> None:
        written = "Henry was the CEO of their fintech arm."
        model = build_fake_model({written: "Avenue was the CEO of their fintech arm."})
        self.assertEqual(checked(model, lines(written), []), [])

    def test_check_does_not_report_a_renamed_character_mid_sentence(self) -> None:
        written = "She could not see Kaelith among the folk at the back."
        model = build_fake_model(
            {written: "She could not see Kenneth among the folk at the back."}
        )
        self.assertEqual(checked(model, lines(written), []), [])

    def test_check_still_reports_a_misspelling_beside_a_name(self) -> None:
        written = "Kendra leaned back in resopnse to the noise."
        model = build_fake_model({written: "Kendra leaned back in response to the noise."})
        found = checked(model, lines(written), [])
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].replacements, ("response",))

    def test_check_still_reports_a_correction_that_keeps_the_name(self) -> None:
        written = "Diane leaned towards him, genuine curious."
        model = build_fake_model({written: "Diane leaned towards him, genuinely curious."})
        found = checked(model, lines(written), [])
        self.assertEqual(len(found), 1)
        self.assertIn("genuinely", found[0].replacements[0])


if __name__ == "__main__":
    unittest.main()
