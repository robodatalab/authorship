import unittest

from server.writing_tools import grammar_check


class Names(unittest.TestCase):
    def test_finds_a_name_that_is_not_at_the_head_of_a_sentence(self) -> None:
        self.assertIn("Kaelith", grammar_check.names_in("The door opened. Then Kaelith ran."))

    def test_does_not_take_the_first_word_of_a_sentence_for_a_name(self) -> None:
        self.assertNotIn("Then", grammar_check.names_in("The door opened. Then it shut."))

    def test_does_not_take_a_month_for_a_name(self) -> None:
        self.assertNotIn("August", grammar_check.names_in("It was over in August that year."))

    def test_masking_goes_out_and_comes_back(self) -> None:
        out, back = grammar_check._name_disguises(["Kaelith"])
        sent = grammar_check._with_words_swapped("Kaelith ran home.", out)
        self.assertNotIn("Kaelith", sent)
        self.assertEqual(grammar_check._with_words_swapped(sent, back), "Kaelith ran home.")


if __name__ == "__main__":
    unittest.main()
