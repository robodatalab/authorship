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


class Check(unittest.TestCase):
    def test_reports_a_real_correction(self) -> None:
        model = build_fake_model({"I like to swimming.": "I like swimming."})
        found = checked(model, lines("I like to swimming."), [])
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].kind, "grammar")
        self.assertEqual(found[0].replacements, ("",))

    def test_says_nothing_when_the_model_says_nothing(self) -> None:
        model = build_fake_model({})
        self.assertEqual(checked(model, lines("Nothing wrong here."), []), [])

    def test_does_not_report_a_closed_up_dash(self) -> None:
        model = build_fake_model(
            {
                "What came after - complete silence.":
                    "What came after-complete silence."
            }
        )
        self.assertEqual(
            checked(model, lines("What came after - complete silence."), []),
            [],
        )

    def test_never_shows_the_model_a_quotation_mark(self) -> None:
        model = build_fake_model({})
        checked(
            model,
            lines('"Hello everyone, nice to see you again" she said in a voice.'),
            [],
        )
        asked = " ".join(call.args[0] for call in model.rewrite.call_args_list)
        self.assertTrue(asked, "the model was never asked anything")
        for mark in '"“”«»':
            self.assertNotIn(mark, asked)

    def test_reports_the_segment_the_fault_is_in(self) -> None:
        written = '"Hello everyone, nice to see you again" she said in a voice.'
        model = build_fake_model({"she said in a voice.": "she said in a loud voice."})
        found = checked(model, lines(written), [])
        self.assertEqual(len(found), 1)
        self.assertIn("she said in a voice.", found[0].detail)
        self.assertIn("she said in a loud voice.", found[0].detail)

    def test_does_not_ask_about_a_quote_the_sentence_before_left_behind(self) -> None:
        model = build_fake_model({})
        checked(
            model,
            lines('"That is all."\nShe was expecting the room to start whispering.'),
            [],
        )
        asked = [call.args[0] for call in model.rewrite.call_args_list]
        self.assertTrue(asked, "the model was never asked anything")
        for one in asked:
            self.assertEqual(one, one.strip(), one)

    def test_hides_the_names_from_the_model(self) -> None:
        model = build_fake_model({})
        checked(model, lines("The door opened. Then Kaelith ran home."), ["Kaelith"])
        asked = " ".join(call.args[0] for call in model.rewrite.call_args_list)
        self.assertNotIn("Kaelith", asked)

    def test_puts_the_names_back_before_reporting(self) -> None:
        model = build_fake_model({"Then John ran home fast.": "Then John ran home."})
        found = checked(model, lines("Then Kaelith ran home fast."), ["Kaelith"])
        self.assertEqual(len(found), 1)
        self.assertNotIn("John", found[0].detail)
        self.assertIn("Kaelith", found[0].detail)

    def test_places_a_finding_on_the_line_it_is_on(self) -> None:
        model = build_fake_model({"I like to swimming.": "I like swimming."})
        found = checked(
            model, lines("Nothing wrong here.\nI like to swimming."), []
        )
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].at.line, 1)

    def test_a_finding_spans_the_words_it_is_about(self) -> None:
        model = build_fake_model({"I like to swimming.": "I like swimming."})
        found = checked(model, lines("I like to swimming."), [])
        said = "I like to swimming."
        self.assertEqual(said[found[0].at.character : found[0].end.character], "to ")


if __name__ == "__main__":
    unittest.main()
