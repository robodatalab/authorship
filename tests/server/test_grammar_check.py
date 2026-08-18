import unittest
from unittest import mock

from server.writing_tools import grammar_check
from server.writing_tools.prose_check import Passage


def build_fake_model(answers: dict[str, str]) -> mock.MagicMock:
    """A model that answers by lookup, and answers with the question otherwise."""
    model = mock.MagicMock()
    model.complete.side_effect = lambda system, user, tokens: answers.get(user, user)
    return model


def lines(text: str) -> list[tuple[int, str]]:
    return list(enumerate(text.split("\n")))


class Typography(unittest.TestCase):
    def test_a_spaced_dash_closed_up_is_not_a_correction(self) -> None:
        self.assertEqual(
            grammar_check._typography("after - complete"),
            grammar_check._typography("after-complete"),
        )

    def test_an_em_dash_turned_into_a_hyphen_is_not_a_correction(self) -> None:
        self.assertEqual(
            grammar_check._typography("after — complete"),
            grammar_check._typography("after-complete"),
        )

    def test_a_space_put_in_front_of_a_bracket_is_not_a_correction(self) -> None:
        self.assertEqual(
            grammar_check._typography("crossed)."),
            grammar_check._typography("crossed )."),
        )

    def test_a_deleted_quotation_mark_is_not_a_correction(self) -> None:
        self.assertEqual(
            grammar_check._typography('"Hello'),
            grammar_check._typography("Hello"),
        )

    def test_a_missing_comma_is_a_correction(self) -> None:
        self.assertNotEqual(
            grammar_check._typography("well then"),
            grammar_check._typography("well, then"),
        )

    def test_a_missing_apostrophe_is_a_correction(self) -> None:
        # Apostrophes are left out of the set on purpose: they are quotation
        # marks only some of the time, and a missing one is a real fault.
        self.assertNotEqual(
            grammar_check._typography("dont"),
            grammar_check._typography("don't"),
        )


class Trimming(unittest.TestCase):
    def test_drops_a_closing_quote_the_previous_sentence_left_behind(self) -> None:
        text = '" She was expecting the room to start whispering.'
        at, end = grammar_check._trimmed(text, 0, len(text))
        self.assertEqual(text[at:end], "She was expecting the room to start whispering.")

    def test_drops_a_curly_closer_at_the_head(self) -> None:
        text = "” And then she left."
        at, end = grammar_check._trimmed(text, 0, len(text))
        self.assertEqual(text[at:end], "And then she left.")

    def test_leaves_a_balanced_pair_alone(self) -> None:
        text = '"And what caused it?" she asked.'
        at, end = grammar_check._trimmed(text, 0, len(text))
        self.assertEqual(text[at:end], text)

    def test_leaves_dialogue_that_opens_a_sentence_alone(self) -> None:
        text = '"Hello everyone, nice to see you again" she said.'
        at, end = grammar_check._trimmed(text, 0, len(text))
        self.assertEqual(text[at:end], text)

    def test_only_ever_narrows(self) -> None:
        text = 'She said "no".'
        at, end = grammar_check._trimmed(text, 0, len(text))
        self.assertGreaterEqual(at, 0)
        self.assertLessEqual(end, len(text))


def segments(text: str) -> list[str]:
    """The runs the model would be asked about, as strings."""
    passage = Passage(lines(text))
    return [passage.text[at:end] for at, end in grammar_check._segments(passage)]


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
        found = grammar_check._segments(passage)
        self.assertEqual(found, sorted(found))

    def test_segments_never_overlap(self) -> None:
        passage = Passage(lines('"Hello," she said. "Come in," he answered.'))
        found = grammar_check._segments(passage)
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


class Edits(unittest.TestCase):
    def test_a_replaced_word_is_one_edit_over_that_word(self) -> None:
        before = "I like to swimming"
        edits = grammar_check._edits(before, "I like swimming")
        self.assertEqual(len(edits), 1)
        at, end, now = edits[0]
        self.assertEqual(before[at:end], "to ")
        self.assertEqual(now, "")

    def test_an_insertion_carries_the_word_it_is_drawn_on(self) -> None:
        # Applying the replacement over the span has to reproduce the correction,
        # or putting the fix in takes a character out with it.
        before = "I went store"
        after = "I went to the store"
        edits = grammar_check._edits(before, after)
        self.assertEqual(len(edits), 1)
        at, end, now = edits[0]
        self.assertEqual(before[:at] + now + before[end:], after)

    def test_every_edit_rebuilds_the_correction(self) -> None:
        before = "she dont know it was them"
        after = "She doesn't know it was them."
        rebuilt = before
        for at, end, now in reversed(grammar_check._edits(before, after)):
            rebuilt = rebuilt[:at] + now + rebuilt[end:]
        self.assertEqual(rebuilt, after)

    def test_an_unchanged_sentence_has_no_edits(self) -> None:
        self.assertEqual(grammar_check._edits("Nothing wrong.", "Nothing wrong."), [])


class Names(unittest.TestCase):
    def test_finds_a_name_that_is_not_at_the_head_of_a_sentence(self) -> None:
        self.assertIn("Kaelith", grammar_check.names_in("The door opened. Then Kaelith ran."))

    def test_does_not_take_the_first_word_of_a_sentence_for_a_name(self) -> None:
        self.assertNotIn("Then", grammar_check.names_in("The door opened. Then it shut."))

    def test_does_not_take_a_month_for_a_name(self) -> None:
        self.assertNotIn("August", grammar_check.names_in("It was over in August that year."))

    def test_masking_goes_out_and_comes_back(self) -> None:
        out, back = grammar_check._masking(["Kaelith"])
        sent = grammar_check._swapped("Kaelith ran home.", out)
        self.assertNotIn("Kaelith", sent)
        self.assertEqual(grammar_check._swapped(sent, back), "Kaelith ran home.")


class Check(unittest.TestCase):
    def test_reports_a_real_correction(self) -> None:
        model = build_fake_model({"I like to swimming.": "I like swimming."})
        found = grammar_check.check(model, lines("I like to swimming."), [])
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].kind, "grammar")
        self.assertEqual(found[0].replacements, ("",))

    def test_says_nothing_when_the_model_says_nothing(self) -> None:
        model = build_fake_model({})
        self.assertEqual(grammar_check.check(model, lines("Nothing wrong here."), []), [])

    def test_does_not_report_a_closed_up_dash(self) -> None:
        model = build_fake_model(
            {
                "What came after - complete silence.":
                    "What came after-complete silence."
            }
        )
        self.assertEqual(
            grammar_check.check(model, lines("What came after - complete silence."), []),
            [],
        )

    def test_never_shows_the_model_a_quotation_mark(self) -> None:
        model = build_fake_model({})
        grammar_check.check(
            model,
            lines('"Hello everyone, nice to see you again" she said in a voice.'),
            [],
        )
        asked = " ".join(call.args[1] for call in model.complete.call_args_list)
        self.assertTrue(asked, "the model was never asked anything")
        for mark in '"“”«»':
            self.assertNotIn(mark, asked)

    def test_reports_the_segment_the_fault_is_in(self) -> None:
        written = '"Hello everyone, nice to see you again" she said in a voice.'
        model = build_fake_model({"she said in a voice.": "she said in a loud voice."})
        found = grammar_check.check(model, lines(written), [])
        self.assertEqual(len(found), 1)
        self.assertIn("she said in a voice.", found[0].detail)
        self.assertIn("she said in a loud voice.", found[0].detail)

    def test_does_not_ask_about_a_quote_the_sentence_before_left_behind(self) -> None:
        model = build_fake_model({})
        grammar_check.check(
            model,
            lines('"That is all."\nShe was expecting the room to start whispering.'),
            [],
        )
        asked = [call.args[1] for call in model.complete.call_args_list]
        self.assertTrue(asked, "the model was never asked anything")
        for one in asked:
            self.assertEqual(one, one.strip(), one)

    def test_hides_the_names_from_the_model(self) -> None:
        model = build_fake_model({})
        grammar_check.check(model, lines("The door opened. Then Kaelith ran home."), ["Kaelith"])
        asked = " ".join(call.args[1] for call in model.complete.call_args_list)
        self.assertNotIn("Kaelith", asked)

    def test_puts_the_names_back_before_reporting(self) -> None:
        model = build_fake_model({"Then John ran home fast.": "Then John ran home."})
        found = grammar_check.check(model, lines("Then Kaelith ran home fast."), ["Kaelith"])
        self.assertEqual(len(found), 1)
        self.assertNotIn("John", found[0].detail)
        self.assertIn("Kaelith", found[0].detail)

    def test_places_a_finding_on_the_line_it_is_on(self) -> None:
        model = build_fake_model({"I like to swimming.": "I like swimming."})
        found = grammar_check.check(
            model, lines("Nothing wrong here.\nI like to swimming."), []
        )
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].at.line, 1)

    def test_a_finding_spans_the_words_it_is_about(self) -> None:
        model = build_fake_model({"I like to swimming.": "I like swimming."})
        found = grammar_check.check(model, lines("I like to swimming."), [])
        said = "I like to swimming."
        self.assertEqual(said[found[0].at.character : found[0].end.character], "to ")


if __name__ == "__main__":
    unittest.main()
