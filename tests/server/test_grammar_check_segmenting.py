import unittest

from server.writing_tools import grammar_check
from server.writing_tools.prose_check import Passage


def lines(text: str) -> list[tuple[int, str]]:
    return list(enumerate(text.split("\n")))


def segments(text: str) -> list[str]:
    """The runs the model would be asked about, as strings."""
    passage = Passage(lines(text))
    return [passage.text[at:end] for at, end in grammar_check._sentences_to_ask_about(passage)]


class Segmenting(unittest.TestCase):
    def test_one_plain_sentence_is_one_segment(self) -> None:
        self.assertEqual(
            segments("She entered the conference room."),
            ["She entered the conference room."],
        )

    def test_two_sentences_on_one_line_are_two_segments(self) -> None:
        self.assertEqual(
            segments("She entered the room. The heads were already there."),
            ["She entered the room.", "The heads were already there."],
        )

    def test_a_line_break_ends_a_segment_even_without_a_full_stop(self) -> None:
        # The three paragraphs that came back as one sentence, joined and
        # lower-cased, because none of the first two ended in a full stop.
        self.assertEqual(
            segments(
                '"We\'re down 1%, so nearly 35 million users"\n'
                '"Since the beginning of the quarter?" she needed him to clarify\n'
                '"No, that\'s only over the course of the last 2 days."'
            ),
            [
                "We're down 1%, so nearly 35 million users",
                "Since the beginning of the quarter?",
                "she needed him to clarify",
                "No, that's only over the course of the last 2 days.",
            ],
        )

    def test_speech_and_the_tag_after_it_are_separate_segments(self) -> None:
        self.assertEqual(
            segments('"Hello everyone, nice to see you again" she said in a voice.'),
            ["Hello everyone, nice to see you again", "she said in a voice."],
        )

    def test_speech_split_by_a_tag_gives_three_segments(self) -> None:
        self.assertEqual(
            segments('"Where are we now?" she asked. "And what caused it?"'),
            ["Where are we now?", "she asked.", "And what caused it?"],
        )

    def test_two_sentences_inside_one_quotation_are_two_segments(self) -> None:
        # Inside a quotation the full stops still count, which is the whole of
        # "then pay attention to dots". A quotation is one sentence to the
        # parser however many stops it holds, so it is shown without its marks.
        self.assertEqual(
            segments('"No, never. Not once in ten years."'),
            ["No, never.", "Not once in ten years."],
        )

    def test_three_sentences_inside_one_quotation_are_three_segments(self) -> None:
        self.assertEqual(
            segments('"It fell. Nobody noticed. Nobody said anything at all."'),
            ["It fell.", "Nobody noticed.", "Nobody said anything at all."],
        )

    def test_a_question_and_an_exclamation_inside_a_quotation_both_end_one(self) -> None:
        self.assertEqual(
            segments('"Where were you? I waited all evening! Nobody came."'),
            ["Where were you?", "I waited all evening!", "Nobody came."],
        )

    def test_a_run_inside_a_quotation_too_short_to_ask_about_is_dropped(self) -> None:
        self.assertEqual(
            segments('"No. Not once in ten years."'),
            ["Not once in ten years."],
        )

    def test_curly_quotes_cut_the_same_as_straight_ones(self) -> None:
        self.assertEqual(
            segments("\u201cHello everyone, nice to see you\u201d she said in a voice."),
            ["Hello everyone, nice to see you", "she said in a voice."],
        )

    def test_an_unclosed_quotation_costs_nothing(self) -> None:
        self.assertEqual(
            segments('"Where are we now she asked without finishing the thought.'),
            ["Where are we now she asked without finishing the thought."],
        )

    def test_a_quotation_inside_a_sentence_is_cut_out_of_it(self) -> None:
        self.assertEqual(
            segments('He called it the "Consciousness War" for want of a name.'),
            ["He called it the", "Consciousness War", "for want of a name."],
        )

    def test_a_paragraph_ending_in_a_full_stop_still_ends(self) -> None:
        self.assertEqual(
            segments("She entered the room.\nThe heads were already there."),
            ["She entered the room.", "The heads were already there."],
        )

    def test_no_segment_holds_a_quotation_mark(self) -> None:
        said = segments(
            '"Hello," she said. "Come in."\n'
            "He did not answer at first.\n"
            '"Later," he told her, "when it is over."'
        )
        self.assertTrue(said)
        for one in said:
            for mark in '"\u201c\u201d':
                self.assertNotIn(mark, one, one)

    def test_no_segment_holds_a_line_break(self) -> None:
        said = segments(
            "She entered the room\nThe heads were already there\nNobody spoke"
        )
        self.assertTrue(said)
        for one in said:
            self.assertNotIn("\n", one, one)

    def test_no_segment_begins_or_ends_in_space(self) -> None:
        said = segments('"Hello everyone" she said. "Do come in" he added.')
        self.assertTrue(said)
        for one in said:
            self.assertEqual(one, one.strip(), repr(one))

    def test_every_segment_holds_a_word(self) -> None:
        said = segments('"..." she said. "?!" he answered. "Well then."')
        for one in said:
            self.assertRegex(one, "[A-Za-z]", repr(one))

    def test_segments_stay_in_the_order_they_were_written(self) -> None:
        passage = Passage(lines('"One." she said.\n"Two." he said.'))
        found = grammar_check._sentences_to_ask_about(passage)
        self.assertEqual(found, sorted(found))

    def test_segments_never_overlap(self) -> None:
        passage = Passage(lines('"Hello," she said. "Come in," he answered.'))
        found = grammar_check._sentences_to_ask_about(passage)
        for (_, end), (at, _) in zip(found, found[1:]):
            self.assertLessEqual(end, at)

    def test_a_run_too_short_to_be_a_sentence_is_not_asked_about(self) -> None:
        self.assertEqual(segments('"Yes." she said.'), ["she said."])

    def test_an_abbreviation_does_not_end_a_segment(self) -> None:
        self.assertEqual(
            segments("Mr. Holloway arrived before the others did."),
            ["Mr. Holloway arrived before the others did."],
        )

    def test_a_decimal_does_not_end_a_segment(self) -> None:
        self.assertEqual(
            segments("The share price fell to 3.5 before anyone noticed."),
            ["The share price fell to 3.5 before anyone noticed."],
        )

    def test_an_empty_passage_has_no_segments(self) -> None:
        self.assertEqual(segments(""), [])

    def test_a_passage_of_punctuation_has_no_segments(self) -> None:
        self.assertEqual(segments('"..." — ... "?"'), [])


if __name__ == "__main__":
    unittest.main()
