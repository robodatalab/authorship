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
    RETRIES,
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


def rate_limited(delay: str) -> httpx.Response:
    """Going too fast: an allowance that exists and is spent for the moment."""
    return build_response(
        429,
        {
            "error": {
                "message": "Quota exceeded for metric: ... requests, limit: 60",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.RetryInfo",
                        "retryDelay": delay,
                    }
                ],
            }
        },
    )


def exhausted() -> httpx.Response:
    """A model the plan does not include at all — the limit is zero."""
    return build_response(
        429,
        {
            "error": {
                "message": "You exceeded your current quota",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": [
                            {
                                "quotaMetric": "generate_content_free_tier_requests",
                                "quotaValue": "0",
                            }
                        ],
                    }
                ],
            }
        },
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
        with mock.patch("httpx.request", return_value=exhausted()):
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


class Models(unittest.TestCase):
    def listing(self, *models: dict) -> httpx.Response:
        return build_response(200, {"models": list(models)})

    def writer(self, name: str) -> dict:
        return {"name": name, "supportedGenerationMethods": ["generateContent"]}

    def test_offers_only_the_models_that_can_be_asked_for_prose(self) -> None:
        answer = self.listing(
            self.writer("models/gemini-3.1-pro"),
            {"name": "models/embedding-001", "supportedGenerationMethods": ["embedContent"]},
        )
        with mock.patch("httpx.request", return_value=answer):
            found = Gemini("k").models()
        self.assertEqual([m["name"] for m in found], ["models/gemini-3.1-pro"])

    def test_puts_the_newest_looking_first_and_a_release_over_its_preview(self) -> None:
        answer = self.listing(
            self.writer("models/gemini-2.5-pro"),
            self.writer("models/gemini-3.1-pro-preview"),
            self.writer("models/gemini-3.1-pro"),
        )
        with mock.patch("httpx.request", return_value=answer):
            found = Gemini("k").models()
        self.assertEqual(
            [m["name"] for m in found],
            [
                "models/gemini-3.1-pro",
                "models/gemini-3.1-pro-preview",
                "models/gemini-2.5-pro",
            ],
        )

    def test_follows_the_pages_rather_than_stopping_at_the_first(self) -> None:
        pages = [
            build_response(
                200,
                {"models": [self.writer("models/gemini-3.1-pro")], "nextPageToken": "more"},
            ),
            self.listing(self.writer("models/gemini-2.5-pro")),
        ]
        with mock.patch("httpx.request", side_effect=pages) as sent:
            found = Gemini("k").models()
        self.assertEqual(len(found), 2)
        self.assertIn("pageToken=more", sent.call_args_list[1].args[1])


class SlowingDown(unittest.TestCase):
    """Being told to go slower, against being told no.

    A pass over a novel is dozens of requests in a row and every tier has a rate
    limit, so one of these is part of the work and the other ends it.
    """

    def setUp(self) -> None:
        super().setUp()
        # Nothing here waits for real; that the wait was asked for is the point.
        self.slept: list[float] = []
        resting = mock.patch("time.sleep", self.slept.append)
        resting.start()
        self.addCleanup(resting.stop)

    def test_a_chapter_told_to_slow_down_is_offered_again(self) -> None:
        answers = [rate_limited("2s"), answering("Fixed.")]
        with mock.patch("httpx.request", side_effect=answers) as sent:
            self.assertEqual(Gemini("k").complete("i", "s"), "Fixed.")
        self.assertEqual(sent.call_count, 2)
        self.assertAlmostEqual(sum(self.slept), 2.0, places=1)

    def test_waits_as_long_as_google_asked(self) -> None:
        answers = [rate_limited("18.252673168s"), answering("Fixed.")]
        with mock.patch("httpx.request", side_effect=answers):
            Gemini("k").complete("i", "s")
        self.assertAlmostEqual(sum(self.slept), 18.5, delta=0.6)

    def test_gives_up_rather_than_holding_a_chapter_for_ever(self) -> None:
        with mock.patch("httpx.request", return_value=rate_limited("1s")) as sent:
            with self.assertRaises(GeminiError):
                Gemini("k").complete("i", "s")
        self.assertEqual(sent.call_count, RETRIES + 1)

    def test_a_model_the_plan_does_not_include_is_not_offered_again(self) -> None:
        # `limit: 0` is not an allowance used up, it is no allowance at all, and
        # waiting for it is waiting for something that will not happen.
        with mock.patch("httpx.request", return_value=exhausted()) as sent:
            with self.assertRaises(GeminiError) as caught:
                Gemini("k", "gemini-3.1-pro").complete("i", "s")
        self.assertEqual(sent.call_count, 1)
        self.assertTrue(caught.exception.no_quota)
        self.assertFalse(caught.exception.transient)
        self.assertIn("not included in your plan", str(caught.exception))

    def test_reads_a_zero_limit_out_of_the_wording_when_there_is_no_detail(self) -> None:
        said = build_response(
            429, {"error": {"message": "Quota exceeded ... limit: 0, model: x"}}
        )
        with mock.patch("httpx.request", return_value=said):
            with self.assertRaises(GeminiError) as caught:
                Gemini("k").complete("i", "s")
        self.assertTrue(caught.exception.no_quota)

    def test_a_gateway_having_a_moment_is_offered_again(self) -> None:
        with mock.patch("httpx.request", side_effect=[build_response(503, {}), answering("Fixed.")]):
            self.assertEqual(Gemini("k").complete("i", "s"), "Fixed.")

    def test_stopping_the_job_ends_the_waiting(self) -> None:
        with mock.patch("httpx.request", return_value=rate_limited("60s")) as sent:
            with self.assertRaises(GeminiError):
                Gemini("k", cancelled=lambda: True).complete("i", "s")
        self.assertEqual(sent.call_count, 1)
        self.assertEqual(self.slept, [])


class Verify(unittest.TestCase):
    def test_writes_with_the_model_rather_than_merely_looking_it_up(self) -> None:
        # Fetching the model proves it exists and the key can see it, which a
        # model outside the plan also does — right up until the first chapter.
        with mock.patch("httpx.request", return_value=answering("OK")) as sent:
            Gemini("k", "gemini-x").verify()
        self.assertEqual(sent.call_args.args[0], "POST")
        self.assertTrue(
            sent.call_args.args[1].endswith("/models/gemini-x:generateContent"),
            sent.call_args.args[1],
        )

    def test_says_nothing_of_an_answer_that_was_all_thinking(self) -> None:
        # A reasoning model can spend a small budget entirely on thinking. That
        # is not a failed key, and verify is not reading the answer.
        thinking = build_response(
            200, {"candidates": [{"content": {"parts": []}, "finishReason": "MAX_TOKENS"}]}
        )
        with mock.patch("httpx.request", return_value=thinking):
            Gemini("k").verify()

    def test_a_model_outside_the_plan_is_caught_here_and_not_mid_manuscript(self) -> None:
        with mock.patch("httpx.request", return_value=exhausted()):
            with self.assertRaises(GeminiError) as caught:
                Gemini("k", "gemini-3.1-pro").verify()
        self.assertTrue(caught.exception.no_quota)

    def test_being_told_to_slow_down_is_not_a_bad_key(self) -> None:
        with mock.patch("httpx.request", return_value=rate_limited("5s")) as sent:
            Gemini("k").verify()
        # Nor is it worth waiting out with somebody sitting at a dialog.
        self.assertEqual(sent.call_count, 1)

    def test_raises_for_a_key_the_api_will_not_take(self) -> None:
        with mock.patch("httpx.request", return_value=build_response(401, {})):
            with self.assertRaises(GeminiError):
                Gemini("k").verify()

    def test_a_retired_model_is_caught_at_sign_in_and_names_its_replacement(self) -> None:
        # The failure this check exists for. Google retires a name by refusing it
        # for new keys, and says in the refusal what to use instead — which is
        # worth passing on verbatim, since it is the answer.
        retired = build_response(
            404,
            {
                "error": {
                    "message": (
                        "This model models/gemini-2.5-pro is no longer available "
                        "to new users. Please update your code to use "
                        "models/gemini-3.1-pro-preview"
                    )
                }
            },
        )
        with mock.patch("httpx.request", return_value=retired):
            with self.assertRaises(GeminiError) as caught:
                Gemini("k", "gemini-2.5-pro").verify()
        # Not a sign-in problem: the key is fine and a new one will not help.
        self.assertFalse(caught.exception.unauthorized)
        self.assertIn("gemini-3.1-pro-preview", str(caught.exception))


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
