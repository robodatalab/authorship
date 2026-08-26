"""Tests for the one model this extension does not run itself.

Nothing here reaches the network. What is under test is the shape of what goes
out, and — much more to the point — what is made of what comes back: an answer
in pieces, an answer that never came because a filter stopped it, and a key the
API refused, which is the one failure the editor has to tell apart from the rest.
"""

import unittest
from unittest import mock

import httpx

from server.writing_tools.gemini import (
    DEFAULT_MODEL,
    Gemini,
    GeminiError,
    configured_key,
    configured_model,
)


def build_response(status: int = 200, body: object = None) -> httpx.Response:
    return httpx.Response(
        status_code=status,
        json=body if body is not None else {},
        request=httpx.Request("POST", "https://example.invalid"),
    )


def answering(*parts: str) -> httpx.Response:
    return build_response(
        200,
        {"candidates": [{"content": {"parts": [{"text": part} for part in parts]}}]},
    )


class Complete(unittest.TestCase):
    def test_asks_the_named_model_with_the_key_in_the_header(self) -> None:
        with mock.patch("httpx.request", return_value=answering("Fixed.")) as sent:
            answer = Gemini("a-key", "gemini-x").complete("Be an editor.", "The prose.")
        self.assertEqual(answer, "Fixed.")
        method, url = sent.call_args.args
        self.assertEqual(method, "POST")
        self.assertTrue(url.endswith("/models/gemini-x:generateContent"), url)
        self.assertEqual(sent.call_args.kwargs["headers"], {"x-goog-api-key": "a-key"})

    def test_the_instruction_is_the_system_turn_and_the_prose_is_the_user_turn(
        self,
    ) -> None:
        with mock.patch("httpx.request", return_value=answering("Fixed.")) as sent:
            Gemini("a-key").complete("Be an editor.", "The prose.")
        body = sent.call_args.kwargs["json"]
        self.assertEqual(
            body["systemInstruction"], {"parts": [{"text": "Be an editor."}]}
        )
        self.assertEqual(
            body["contents"], [{"role": "user", "parts": [{"text": "The prose."}]}]
        )
        # No ceiling unless one was asked for: a budget worked out from the
        # prompt is a budget that truncates the chapter that ran long.
        self.assertNotIn("maxOutputTokens", body["generationConfig"])

    def test_an_answer_that_came_in_pieces_is_one_answer(self) -> None:
        with mock.patch("httpx.request", return_value=answering("One. ", "Two.")):
            self.assertEqual(Gemini("k").complete("i", "s"), "One. Two.")

    def test_a_refused_key_is_told_apart_from_every_other_refusal(self) -> None:
        refused = build_response(403, {"error": {"message": "API key not valid"}})
        with mock.patch("httpx.request", return_value=refused):
            with self.assertRaises(GeminiError) as caught:
                Gemini("k").complete("i", "s")
        self.assertTrue(caught.exception.unauthorized)
        self.assertIn("API key not valid", str(caught.exception))

    def test_a_quota_that_ran_out_is_a_failure_and_not_a_sign_in(self) -> None:
        spent = build_response(429, {"error": {"message": "Quota exceeded"}})
        with mock.patch("httpx.request", return_value=spent):
            with self.assertRaises(GeminiError) as caught:
                Gemini("k").complete("i", "s")
        self.assertFalse(caught.exception.unauthorized)

    def test_an_answer_stopped_by_a_filter_says_why_it_is_empty(self) -> None:
        stopped = build_response(
            200, {"candidates": [{"content": {"parts": []}, "finishReason": "SAFETY"}]}
        )
        with mock.patch("httpx.request", return_value=stopped):
            with self.assertRaisesRegex(GeminiError, "SAFETY"):
                Gemini("k").complete("i", "s")

    def test_a_prompt_that_was_blocked_outright_says_so(self) -> None:
        blocked = build_response(200, {"promptFeedback": {"blockReason": "OTHER"}})
        with mock.patch("httpx.request", return_value=blocked):
            with self.assertRaisesRegex(GeminiError, "OTHER"):
                Gemini("k").complete("i", "s")

    def test_a_network_that_did_not_answer_is_a_gemini_error_like_any_other(self) -> None:
        with mock.patch("httpx.request", side_effect=httpx.ConnectError("no route")):
            with self.assertRaisesRegex(GeminiError, "could not be reached"):
                Gemini("k").complete("i", "s")


class Verify(unittest.TestCase):
    def test_asks_for_the_model_list_and_says_nothing_when_the_key_opens_it(self) -> None:
        with mock.patch("httpx.request", return_value=build_response(200, {"models": []})) as sent:
            Gemini("k").verify()
        self.assertEqual(sent.call_args.args[0], "GET")
        self.assertTrue(sent.call_args.args[1].endswith("/models"))

    def test_raises_for_a_key_the_api_will_not_take(self) -> None:
        with mock.patch("httpx.request", return_value=build_response(401, {})):
            with self.assertRaises(GeminiError):
                Gemini("k").verify()


class Configured(unittest.TestCase):
    def test_the_key_the_editor_sent_wins_over_the_environment(self) -> None:
        with mock.patch.dict("os.environ", {"GEMINI_API_KEY": "shell"}):
            self.assertEqual(configured_key("editor"), "editor")
            self.assertEqual(configured_key(None), "shell")

    def test_no_key_anywhere_is_none_rather_than_an_empty_string(self) -> None:
        with mock.patch.dict("os.environ", {"GEMINI_API_KEY": ""}):
            self.assertIsNone(configured_key(""))

    def test_the_model_falls_back_to_the_one_this_pass_was_written_for(self) -> None:
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertEqual(configured_model(None), DEFAULT_MODEL)
            self.assertEqual(configured_model("gemini-x"), "gemini-x")


if __name__ == "__main__":
    unittest.main()
