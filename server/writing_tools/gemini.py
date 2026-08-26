"""Google's Gemini, as this server talks to it.

Everything else the extension does runs on the machine it is installed on. This
one does not, and that is the whole reason it exists: fixing the style of a
novel means holding chapters of it in the prompt at once, which is a context
length no model that fits beside the others on a laptop has.

So it is the author's own account that pays for it, and the author's own key
that opens it. The key never reaches this module from a file — the editor holds
it in the VS Code secret store and hands it over with the request — with the
environment as the way in for a server started by hand.

Deliberately one class and one shape of call: `complete(instruction, said)`,
which is what `vramen.CausalModel` offers. A tool written against one can be run
against the other, and the tests for what a tool *says* to a model never have to
know which model was going to hear it.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

# Where the REST API lives. `v1beta` is what carries `systemInstruction`, which
# is the difference between telling the model what it is doing and burying the
# instruction in the same turn as the manuscript.
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta"

# The default is the reasoning model rather than the fast one: this is a pass
# over a novel that the author waits minutes for either way, and the thing being
# bought is judgement about prose.
DEFAULT_MODEL = "gemini-2.5-pro"

# The environment is for a server somebody started themselves — under the
# debugger, or on another machine. The editor sends the key with the request.
KEY_VARIABLE = "GEMINI_API_KEY"
MODEL_VARIABLE = "GEMINI_MODEL"

# A chapter can be twenty minutes of reading and the answer is the chapter
# again, so the wait is nothing like an ordinary HTTP call's.
TIMEOUT_S = 600.0


class GeminiError(RuntimeError):
    """Gemini refused, or could not be reached.

    Its own type because the caller has two different things to say about it: a
    key that is wrong is something the author fixes by signing in again, and
    everything else is a job that failed.
    """

    def __init__(self, detail: str, unauthorized: bool = False) -> None:
        super().__init__(detail)
        self.unauthorized = unauthorized


def configured_key(given: str | None = None) -> str | None:
    """The key to use: the one the editor sent, or the one in the environment."""
    return given or os.environ.get(KEY_VARIABLE) or None


def configured_model(given: str | None = None) -> str:
    return given or os.environ.get(MODEL_VARIABLE) or DEFAULT_MODEL


class Gemini:
    """One instruction, one turn, one answer — the same bargain a local model
    makes here, over a wire."""

    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_MODEL,
        timeout: float = TIMEOUT_S,
    ) -> None:
        self.api_key = api_key
        self.model_id = model
        self.timeout = timeout

    def complete(
        self,
        instruction: str,
        said: str,
        max_new_tokens: int | None = None,
        temperature: float = 0.2,
    ) -> str:
        """What the model answers, with nothing around it.

        `max_new_tokens` is a ceiling rather than a target, and is optional here
        where a local model requires it — so this satisfies the same protocol
        either way, and a caller with no reason to bound the answer need not
        invent a bound.
        """
        body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": instruction}]},
            "contents": [{"role": "user", "parts": [{"text": said}]}],
            # Low rather than zero: prose corrected at zero comes back flattened,
            # every sentence reaching for the same construction.
            "generationConfig": {"temperature": temperature},
        }
        if max_new_tokens is not None:
            body["generationConfig"]["maxOutputTokens"] = max_new_tokens
        return _answer(self._post(f"models/{self.model_id}:generateContent", body))

    def verify(self) -> None:
        """Raise unless the key opens the API.

        Asked when the author signs in, so that a mistyped key is a message under
        the box rather than a job that runs for a minute and then fails.
        """
        self._get("models")

    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        return self._call("POST", path, json=body)

    def _get(self, path: str) -> dict[str, Any]:
        return self._call("GET", path)

    def _call(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = httpx.request(
                method,
                f"{ENDPOINT}/{path}",
                headers={"x-goog-api-key": self.api_key},
                timeout=self.timeout,
                **kwargs,
            )
        except httpx.HTTPError as err:
            raise GeminiError(f"Gemini could not be reached: {err}") from err
        if response.status_code >= 400:
            raise GeminiError(
                _complaint(response),
                unauthorized=response.status_code in (401, 403),
            )
        return dict(response.json())


def _complaint(response: httpx.Response) -> str:
    """What Google said went wrong, or failing that what HTTP said.

    Its own message matters here more than it does for a local model: the two
    everyday failures are a key that was revoked and an account with no quota
    left, and neither is anything the author can act on from a status code.
    """
    try:
        said = response.json().get("error", {}).get("message")
    except Exception:
        said = None
    return f"Gemini refused ({response.status_code}): {said or response.reason_phrase}"


def _answer(body: dict[str, Any]) -> str:
    """The text out of the response, or an explanation of why there is none.

    A candidate that came back without text has a `finishReason` saying why —
    the safety filters, or the token ceiling — and that is worth passing on. A
    job that reports "the model said nothing" for a chapter that tripped a filter
    sends the author looking in the wrong place.
    """
    candidates = body.get("candidates") or []
    if not candidates:
        blocked = (body.get("promptFeedback") or {}).get("blockReason")
        raise GeminiError(
            f"Gemini returned nothing ({blocked})"
            if blocked
            else "Gemini returned nothing."
        )
    candidate = candidates[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    said = "".join(part.get("text", "") for part in parts)
    if not said.strip():
        raise GeminiError(
            f"Gemini returned nothing ({candidate.get('finishReason', 'no reason given')})"
        )
    return said
