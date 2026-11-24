import unittest

from server.writing_tools import grammar_check


class Trimming(unittest.TestCase):
    def test_drops_a_closing_quote_the_previous_sentence_left_behind(self) -> None:
        text = '" She was expecting the room to start whispering.'
        at, end = grammar_check._trimmed_of_orphan_quotes(text, 0, len(text))
        self.assertEqual(text[at:end], "She was expecting the room to start whispering.")

    def test_drops_a_curly_closer_at_the_head(self) -> None:
        text = "” And then she left."
        at, end = grammar_check._trimmed_of_orphan_quotes(text, 0, len(text))
        self.assertEqual(text[at:end], "And then she left.")

    def test_leaves_a_balanced_pair_alone(self) -> None:
        text = '"And what caused it?" she asked.'
        at, end = grammar_check._trimmed_of_orphan_quotes(text, 0, len(text))
        self.assertEqual(text[at:end], text)

    def test_leaves_dialogue_that_opens_a_sentence_alone(self) -> None:
        text = '"Hello everyone, nice to see you again" she said.'
        at, end = grammar_check._trimmed_of_orphan_quotes(text, 0, len(text))
        self.assertEqual(text[at:end], text)

    def test_only_ever_narrows(self) -> None:
        text = 'She said "no".'
        at, end = grammar_check._trimmed_of_orphan_quotes(text, 0, len(text))
        self.assertGreaterEqual(at, 0)
        self.assertLessEqual(end, len(text))


if __name__ == "__main__":
    unittest.main()
