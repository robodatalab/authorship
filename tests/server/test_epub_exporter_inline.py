import unittest

from server.publishing.markdown_to_xhtml_converter import _inline


class Inline(unittest.TestCase):
    def test_bold_italic_and_links(self) -> None:
        self.assertEqual(_inline("**bold**"), "<strong>bold</strong>")
        self.assertEqual(_inline("*italic*"), "<em>italic</em>")
        self.assertEqual(_inline("_italic_"), "<em>italic</em>")
        self.assertEqual(
            _inline("[text](http://example.com)"),
            '<a href="http://example.com">text</a>',
        )

    def test_escapes_before_it_formats(self) -> None:
        # The angle bracket is escaped, but the surrounding ** still becomes a tag.
        self.assertEqual(_inline("**a < b**"), "<strong>a &lt; b</strong>")

    def test_a_double_star_is_not_read_as_italic(self) -> None:
        self.assertNotIn("<em>", _inline("**bold**"))

    def test_bold_and_italic_at_once(self) -> None:
        self.assertEqual(_inline("***both***"), "<strong><em>both</em></strong>")

    def test_bold_written_with_underscores(self) -> None:
        self.assertEqual(_inline("__bold__"), "<strong>bold</strong>")

    def test_italic_inside_bold(self) -> None:
        self.assertEqual(
            _inline("**a *word* of it**"),
            "<strong>a <em>word</em> of it</strong>",
        )

    def test_a_star_standing_on_its_own_is_not_italic(self) -> None:
        self.assertEqual(_inline("3 * 4 * 5"), "3 * 4 * 5")

    def test_an_underscore_inside_a_word_is_left_alone(self) -> None:
        self.assertEqual(_inline("snake_case_words"), "snake_case_words")


if __name__ == "__main__":
    unittest.main()
