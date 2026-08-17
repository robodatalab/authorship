import tempfile
import unittest
from pathlib import Path

from server.publishing.authorship import (
    DEFAULT_WORDS_PER_PART,
    TEMPLATE,
    Authorship,
    load,
    path_beside,
    read,
    sections_of,
)


class Sections(unittest.TestCase):
    def test_a_heading_names_what_stands_under_it(self) -> None:
        said = sections_of("## Title\n\nThe Book\n\n## Author\n\nA. Writer\n")
        self.assertEqual(said["title"], "The Book")
        self.assertEqual(said["author"], "A. Writer")

    def test_a_heading_with_nothing_under_it_is_empty(self) -> None:
        said = sections_of("## Subtitle\n\n## Author\n\nA. Writer\n")
        self.assertEqual(said["subtitle"], "")

    def test_notes_are_not_part_of_what_they_stand_under(self) -> None:
        said = sections_of("## Title\n\n<!-- pick a better one -->\nThe Book\n")
        self.assertEqual(said["title"], "The Book")

    def test_a_note_spanning_lines_is_still_a_note(self) -> None:
        said = sections_of("## Title\n\n<!--\nnot this\nnor this\n-->\nThe Book\n")
        self.assertEqual(said["title"], "The Book")

    def test_the_heading_is_found_whatever_its_case(self) -> None:
        self.assertEqual(sections_of("## AUTHOR\n\nA. Writer\n")["author"], "A. Writer")

    def test_what_stands_above_the_first_heading_belongs_to_no_section(self) -> None:
        said = sections_of("# Authorship\n\nsome preamble\n\n## Title\n\nThe Book\n")
        self.assertEqual(list(said), ["title"])


class Reading(unittest.TestCase):
    def test_reads_the_fields_the_book_is_dressed_in(self) -> None:
        book = read(
            "## Subtitle\n\nA Novel\n\n"
            "## Author\n\nA. Writer\n\n## Publisher\n\nRiverlight Press\n\n"
            "## Language\n\npl\n"
        )
        self.assertEqual(book.subtitle, "A Novel")
        self.assertEqual(book.author, "A. Writer")
        self.assertEqual(book.publisher, "Riverlight Press")
        self.assertEqual(book.language, "pl")

    def test_a_title_written_here_is_not_read(self) -> None:
        # The manuscript names the book. A `## Title` someone adds is left in the
        # file untouched, but it is not another answer to the same question.
        self.assertFalse(hasattr(read("## Title\n\nThe Book\n"), "title"))

    def test_a_missing_language_is_english(self) -> None:
        self.assertEqual(read("## Author\n\nA. Writer\n").language, "en")

    def test_the_cover_is_the_path_out_of_a_markdown_image(self) -> None:
        book = read("## Cover\n\n![the cover](art/cover.jpg)\n")
        self.assertEqual(book.cover, "art/cover.jpg")

    def test_a_cover_left_as_a_note_is_no_cover(self) -> None:
        book = read("## Cover\n\n<!-- ![cover](cover.jpg) -->\n")
        self.assertEqual(book.cover, "")

    def test_a_link_carries_the_words_that_send_the_reader(self) -> None:
        book = read("## Author Page\n\n[My website](https://writer.example)\n")
        assert book.author_page is not None
        self.assertEqual(book.author_page.label, "My website")
        self.assertEqual(book.author_page.url, "https://writer.example")

    def test_a_bare_url_is_its_own_label(self) -> None:
        book = read("## Kindle Page\n\nhttps://amazon.example/dp/1\n")
        assert book.kindle is not None
        self.assertEqual(book.kindle.label, "https://amazon.example/dp/1")
        self.assertEqual(book.kindle.url, "https://amazon.example/dp/1")

    def test_the_blurb_keeps_the_shape_the_author_gave_it(self) -> None:
        book = read("## Blurb\n\nOne line.\n\nAnd another.\n")
        self.assertEqual(book.blurb, "One line.\n\nAnd another.")

    def test_words_per_part_is_the_number_in_the_section(self) -> None:
        self.assertEqual(read("## Words per Part\n\n8000\n").words_per_part, 8000)

    def test_words_per_part_falls_back_when_nothing_is_written(self) -> None:
        self.assertEqual(
            read("## Words per Part\n\n").words_per_part, DEFAULT_WORDS_PER_PART
        )

    def test_a_heading_this_module_does_not_know_is_left_alone(self) -> None:
        book = read("## Dedication\n\nFor nobody.\n\n## Author\n\nA. Writer\n")
        self.assertEqual(book.author, "A. Writer")


class Template(unittest.TestCase):
    def test_the_template_reads_as_an_empty_book(self) -> None:
        # Every field is a note until the author writes one, so a template
        # nobody has touched puts no placeholder text into their book.
        book = read(TEMPLATE)
        self.assertEqual(book.subtitle, "")
        self.assertEqual(book.author, "")
        self.assertEqual(book.publisher, "")
        self.assertEqual(book.cover, "")
        self.assertEqual(book.blurb, "")
        self.assertEqual(book.disclaimer, "")
        self.assertIsNone(book.kindle)
        self.assertIsNone(book.author_page)

    def test_the_template_still_carries_the_defaults_worth_having(self) -> None:
        book = read(TEMPLATE)
        self.assertEqual(book.language, "en")
        self.assertEqual(book.words_per_part, DEFAULT_WORDS_PER_PART)

    def test_the_template_names_every_section_the_reader_is_given(self) -> None:
        said = sections_of(TEMPLATE)
        for heading in [
            "subtitle",
            "author",
            "publisher",
            "language",
            "cover",
            "blurb",
            "disclaimer",
            "kindle page",
            "author page",
            "words per part",
        ]:
            with self.subTest(heading=heading):
                self.assertIn(heading, said)

    def test_the_template_does_not_offer_a_title(self) -> None:
        # The one thing it must not invite, since the manuscript already has it.
        self.assertNotIn("title", sections_of(TEMPLATE))


class Beside(unittest.TestCase):
    def test_it_sits_beside_the_manuscript(self) -> None:
        self.assertEqual(
            path_beside(Path("/stories/dusk.md")),
            Path("/stories/dusk.authorship.md"),
        )

    def test_a_manuscript_that_was_never_dressed_reads_as_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            book = load(Path(folder) / "nothing.authorship.md")
        self.assertEqual(book, Authorship())


if __name__ == "__main__":
    unittest.main()
