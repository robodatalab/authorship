import unittest

from server.writing_tools import grammar_check


class Edits(unittest.TestCase):
    def test_a_replaced_word_is_one_edit_over_that_word(self) -> None:
        before = "I like to swimming"
        edits = grammar_check._word_aligned_edits(before, "I like swimming")
        self.assertEqual(len(edits), 1)
        at, end, now = edits[0]
        self.assertEqual(before[at:end], "to ")
        self.assertEqual(now, "")

    def test_an_insertion_carries_the_word_it_is_drawn_on(self) -> None:
        # Applying the replacement over the span has to reproduce the correction,
        # or putting the fix in takes a character out with it.
        before = "I went store"
        after = "I went to the store"
        edits = grammar_check._word_aligned_edits(before, after)
        self.assertEqual(len(edits), 1)
        at, end, now = edits[0]
        self.assertEqual(before[:at] + now + before[end:], after)

    def test_every_edit_rebuilds_the_correction(self) -> None:
        before = "she dont know it was them"
        after = "She doesn't know it was them."
        rebuilt = before
        for at, end, now in reversed(grammar_check._word_aligned_edits(before, after)):
            rebuilt = rebuilt[:at] + now + rebuilt[end:]
        self.assertEqual(rebuilt, after)

    def test_an_unchanged_sentence_has_no_edits(self) -> None:
        self.assertEqual(grammar_check._word_aligned_edits("Nothing wrong.", "Nothing wrong."), [])


if __name__ == "__main__":
    unittest.main()
