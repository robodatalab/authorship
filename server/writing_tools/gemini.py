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
import re
import time
from collections.abc import Callable
from typing import Any

import httpx

from server import log

_log = log.logger(__name__)

# Where the REST API lives. `v1beta` is what carries `systemInstruction`, which
# is the difference between telling the model what it is doing and burying the
# instruction in the same turn as the manuscript.
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta"

# The default is the reasoning model rather than the fast one: this is a pass
# over a novel that the author waits minutes for either way, and the thing being
# bought is judgement about prose.
#
# Model names go stale, and Google retires one by refusing it for new keys rather
# than by keeping it working — so this is a default and not a constant. The
# `authorship.gemini.model` setting overrides it without a new release, and the
# 404 that a retired name earns says which name replaced it.
DEFAULT_MODEL = "gemini-3.1-pro-preview"

# The environment is for a server somebody started themselves — under the
# debugger, or on another machine. The editor sends the key with the request.
KEY_VARIABLE = "GEMINI_API_KEY"
MODEL_VARIABLE = "GEMINI_MODEL"

# A chapter can be twenty minutes of reading and the answer is the chapter
# again, so the wait is nothing like an ordinary HTTP call's.
TIMEOUT_S = 600.0

# The filters this API lets a caller set, turned down as far as it allows.
#
# A novel is not a chat assistant. Fiction contains violence, cruelty, sex and
# people saying appalling things to each other, and a manuscript is the author's
# own work being copy-edited rather than anything the model is being asked to
# invent. A corrector that refuses a thriller for its murders is not a corrector.
#
# These four are the adjustable ones. Google's own policy sits behind them and is
# not adjustable by anybody — a chapter refused as PROHIBITED_CONTENT is refused
# whatever is set here, and no arrangement of this request will change that.
SAFETY_SETTINGS = [
    {"category": category, "threshold": "BLOCK_NONE"}
    for category in (
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
    )
]

# The listing is paged. Asked for in one go, with the loop there anyway because
# a page size is a request and not a promise.
_PAGE = 1000

# How many times a chapter refused for going too fast is offered again.
#
# A pass over a novel is dozens of requests in a row, and every tier has a rate
# limit — so being told to slow down is an ordinary part of the work rather than
# a failure, and a pass that gave up on the first one would never finish a book
# on the free tier. Being told the plan does not include the model at all is not
# this, and is not retried.
RETRIES = 5

# What to wait when Google does not say. Doubling, so a run of refusals backs
# further off rather than hammering at the same rate.
FIRST_WAIT_S = 5.0

# However long it says, this is as long as we will actually hold a chapter.
MAX_WAIT_S = 120.0


class GeminiError(RuntimeError):
    """Gemini refused, or could not be reached.

    Its own type because the caller has three different things to say about it,
    and they ask for three different things of the author. A key that is wrong is
    fixed by signing in again. A model the plan does not include is fixed by
    choosing another one, or by putting the account on a paid tier — and no
    amount of waiting will do it. Everything else is a job that failed.
    """

    def __init__(
        self,
        detail: str,
        unauthorized: bool = False,
        no_quota: bool = False,
        retry_after: float | None = None,
        truncated: bool = False,
        refused: bool = False,
    ) -> None:
        super().__init__(detail)
        self.unauthorized = unauthorized
        # The answer was cut off against the token ceiling. What came back is
        # real text and is the beginning of the right answer, which is exactly
        # what makes it dangerous: it looks usable and is half a chapter.
        self.truncated = truncated
        # Google would not read this chapter, or would not answer about it.
        self.refused = refused
        # The plan allows none of this model at all — `limit: 0` — as opposed to
        # an allowance that has been used up for the minute.
        self.no_quota = no_quota
        # How long Google asked us to wait, when it asked. Only ever set on a
        # refusal that is worth offering again.
        self.retry_after = retry_after

    @property
    def transient(self) -> bool:
        """Whether offering the same request again could plausibly work."""
        return self.retry_after is not None and not self.no_quota

    @property
    def one_chapter(self) -> bool:
        """Whether this went wrong with the answer rather than with the account.

        A chapter that came back cut off, or that Google would not read at all,
        says nothing about the chapter after it — so a pass over a novel carries
        on and reports it. A key, a quota or a network says everything about the
        chapter after it, and the pass stops.
        """
        return self.truncated or self.refused


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
        cancelled: Callable[[], bool] = lambda: False,
        waiting: Callable[[str | None], None] = lambda note: None,
    ) -> None:
        self.api_key = api_key
        self.model_id = model
        self.timeout = timeout
        # Waiting out a rate limit can be a minute, and an author who pressed
        # stop should not watch the bar sit there for it.
        self.cancelled = cancelled
        # Said out loud while it waits, and unsaid when it stops. A pass that
        # holds a chapter back for ten minutes without a word is a pass that has
        # crashed as far as anyone watching it can tell — which is exactly how
        # this looked the first time it happened.
        self.waiting = waiting

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
            "safetySettings": SAFETY_SETTINGS,
            # Low rather than zero: prose corrected at zero comes back flattened,
            # every sentence reaching for the same construction.
            "generationConfig": {"temperature": temperature},
        }
        if max_new_tokens is not None:
            body["generationConfig"]["maxOutputTokens"] = max_new_tokens
        return _answer(self._post(f"models/{self.model_id}:generateContent", body))

    def models(self) -> list[dict[str, Any]]:
        """Every model this key can write with, newest-looking first.

        Asked of Google rather than kept in a list here, because a list here is
        the thing that went stale. What comes back is what the account can
        actually reach today, which is the only authority on the question.

        Only the ones that can be asked for prose: the API lists embedders and
        retired entries alongside the rest, and neither is an answer to "which
        model should correct my chapter".
        """
        found: list[dict[str, Any]] = []
        page: str | None = None
        while True:
            asked = f"models?pageSize={_PAGE}"
            if page:
                asked += f"&pageToken={page}"
            answer = self._get(asked)
            found.extend(answer.get("models") or [])
            page = answer.get("nextPageToken")
            if not page:
                break
        writers = [
            model
            for model in found
            if "generateContent" in (model.get("supportedGenerationMethods") or [])
        ]
        return sorted(writers, key=_newest_first)

    def verify(self) -> None:
        """Raise unless the key can actually write with this model.

        A generation, and the smallest one there is, rather than a lookup.
        Fetching the model proves it exists and that the key can see it, which is
        not the same as being allowed to use it: a model outside the account's
        plan is listed, is fetchable, and then refuses the first chapter with a
        quota of zero. Writing is the only honest test of being able to write.

        The answer is not read. A reasoning model can spend a small budget
        entirely on thinking and come back with no text at all, which says
        nothing about the key — what is being asked here is whether the request
        was accepted.

        Not retried, unlike the work: this is somebody waiting at a dialog, and
        being told to slow down already answers the question.
        """
        try:
            self._post(
                f"models/{self.model_id}:generateContent",
                {
                    "contents": [{"role": "user", "parts": [{"text": "Say OK."}]}],
                    "generationConfig": {"maxOutputTokens": 16},
                },
                retries=0,
            )
        except GeminiError as err:
            # Being told to slow down means the key and the model are both fine,
            # which is exactly what was being asked.
            if err.transient:
                return
            raise

    def _post(
        self, path: str, body: dict[str, Any], retries: int = RETRIES
    ) -> dict[str, Any]:
        return self._call("POST", path, retries, json=body)

    def _get(self, path: str) -> dict[str, Any]:
        return self._call("GET", path, RETRIES)

    def _call(
        self, method: str, path: str, retries: int, **kwargs: Any
    ) -> dict[str, Any]:
        """One request, offered again if Google only asked us to slow down.

        The retry is here rather than around the whole chapter because that is
        where the distinction lives: this is the only place that has seen the
        status code and the quota detail, and everything above it would have to
        be told them to make the same decision.
        """
        waited = 0.0
        for attempt in range(retries + 1):
            try:
                return self._once(method, path, **kwargs)
            except GeminiError as err:
                if not err.transient or attempt == retries or self.cancelled():
                    raise
                waited = min(
                    err.retry_after or max(FIRST_WAIT_S, waited * 2), MAX_WAIT_S
                )
                _log_wait(self.model_id, waited, attempt + 1, retries)
                self.waiting(
                    f"{self.model_id} is rate limited — waiting {waited:.0f}s "
                    f"(try {attempt + 2} of {retries + 1})"
                )
                try:
                    self._hold(waited)
                finally:
                    self.waiting(None)
        raise AssertionError("unreachable")

    def _hold(self, seconds: float) -> None:
        """Wait, in pieces, so that stopping the job does not have to wait too."""
        rested = 0.0
        while rested < seconds and not self.cancelled():
            time.sleep(min(0.5, seconds - rested))
            rested += 0.5

    def _once(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
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
            raise _refusal(response)
        return dict(response.json())


def _refusal(response: httpx.Response) -> GeminiError:
    """A refusal read for what the author can do about it.

    The message matters here more than it does for a local model, and so does
    telling the three apart. A 429 is the one that needs reading rather than
    reporting: `limit: 0` means the plan does not include this model and no
    amount of waiting will change that, while any other 429 is Google saying
    the pass is going too fast, which it will stop saying shortly.
    """
    try:
        error = dict(response.json().get("error") or {})
    except Exception:
        error = {}
    said = error.get("message")
    detail = f"Gemini refused ({response.status_code}): {said or response.reason_phrase}"

    if response.status_code in (401, 403):
        return GeminiError(detail, unauthorized=True)
    if response.status_code == 429:
        if _allows_none(error, said):
            return GeminiError(
                f"{detail}\n\nThis model is not included in your plan "
                "(the limit is zero, not merely used up). Choose another model, "
                "or enable billing on the account the key belongs to.",
                no_quota=True,
            )
        return GeminiError(detail, retry_after=_retry_after(error))
    # A gateway that is briefly overloaded is the same shape of problem as being
    # told to slow down, and the same answer: offer it again in a moment.
    if response.status_code in (500, 502, 503, 504):
        return GeminiError(detail, retry_after=FIRST_WAIT_S)
    return GeminiError(detail)


def _details(error: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    """The structured parts of a refusal of one `@type`, which is where Google
    says the things worth acting on rather than only printing."""
    return [
        part
        for part in (error.get("details") or [])
        if isinstance(part, dict) and str(part.get("@type", "")).endswith(kind)
    ]


def _allows_none(error: dict[str, Any], said: str | None) -> bool:
    """Whether the plan allows none of this model, as against none right now.

    Read from the structured violations where they are there, and out of the
    message where they are not — the wording is Google's and could change, so it
    is the fallback rather than the answer.
    """
    for failure in _details(error, "QuotaFailure"):
        for violation in failure.get("violations") or []:
            if str(violation.get("quotaValue", "")).strip() == "0":
                return True
    return bool(said) and _ZERO_LIMIT.search(said or "") is not None


def _retry_after(error: dict[str, Any]) -> float:
    """How long Google asked us to wait, or a first guess if it did not."""
    for info in _details(error, "RetryInfo"):
        found = _SECONDS.fullmatch(str(info.get("retryDelay", "")).strip())
        if found:
            return min(float(found.group(1)), MAX_WAIT_S)
    return FIRST_WAIT_S


def _log_wait(model: str, seconds: float, attempt: int, of: int) -> None:
    _log.info(
        "%s asked us to slow down; holding %.0fs before try %d of %d",
        model,
        seconds,
        attempt + 1,
        of + 1,
    )


def _answer(body: dict[str, Any]) -> str:
    """The text out of the response, or why there is none — or none worth having.

    `finishReason` is read whether or not there is text, and that is the whole
    point of this function. An answer stopped against the token ceiling comes
    back as real text: the opening of the right answer, correctly written, and
    missing everything after it. Returned, it reads as a corrected chapter and
    replaces one — which is how a chapter of a manuscript once became the words
    "Come closer" and nothing else.

    Anything other than `STOP` means the model did not finish saying what it had
    to say, and nothing it managed to say is usable as a chapter.
    """
    candidates = body.get("candidates") or []
    if not candidates:
        blocked = (body.get("promptFeedback") or {}).get("blockReason")
        if blocked:
            raise GeminiError(_refused_reading(str(blocked)), refused=True)
        raise GeminiError("Gemini returned nothing.")
    candidate = candidates[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    said = "".join(part.get("text", "") for part in parts)
    reason = str(candidate.get("finishReason") or "")

    if reason == "MAX_TOKENS":
        raise GeminiError(
            "Gemini ran out of room and stopped mid-answer. What it had written "
            "is the opening of the chapter and not the chapter, so it has been "
            "thrown away rather than put in the document.",
            truncated=True,
        )
    if not said.strip():
        raise GeminiError(f"Gemini returned nothing ({reason or 'no reason given'})")
    # Every other reason a model stops early — a filter, a stop sequence, a
    # recitation block — leaves the same half-answer behind.
    if reason not in ("", "STOP"):
        raise GeminiError(
            f"Gemini stopped before it had finished ({reason}), so what it wrote "
            "is part of a chapter and has been thrown away.",
            truncated=True,
        )
    return said


def _refused_reading(blocked: str) -> str:
    """Why Google would not read the chapter, said so the author can act on it.

    The distinction that matters is whether anything can be done. The adjustable
    filters are already turned down as far as the API allows, so a chapter
    refused under Google's own policy is refused for good — and an author told
    only `PROHIBITED_CONTENT` will reasonably go looking for the setting that
    fixes it. There is not one.
    """
    if blocked == "PROHIBITED_CONTENT":
        return (
            "Google would not read this chapter: it falls under the Gemini API's "
            "prohibited-content policy, which is Google's own and cannot be "
            "turned off by this extension or by any setting in your account. "
            "Authorship already asks for the adjustable safety filters to be "
            "relaxed as far as the API allows. Fiction that Gemini will not "
            "read has to be corrected by a model that will."
        )
    if blocked in ("SAFETY", "IMAGE_SAFETY"):
        return (
            f"Gemini's safety filters stopped this chapter ({blocked}), despite "
            "Authorship asking for them to be relaxed as far as the API allows."
        )
    return f"Gemini would not read this chapter ({blocked})."


# `limit: 0` in the prose of a refusal, for when the structured detail is absent.
_ZERO_LIMIT = re.compile(r"limit:\s*0\b")

# Google writes a retry delay as `18.252673168s`.
_SECONDS = re.compile(r"([0-9]+(?:\.[0-9]+)?)s")


# A version out of a model's name — `models/gemini-3.1-pro-preview` is 3.1.
_VERSION = re.compile(r"(\d+)(?:\.(\d+))?")


def _newest_first(model: dict[str, Any]) -> tuple[int, int, int, str]:
    """How the list is ordered for somebody choosing from it.

    Ordering only. Nothing here picks a model on the author's behalf — "latest"
    is a guess made from a string, and silently moving a novel onto a different
    model because its name sorted higher is not a guess worth making. It puts
    the likeliest answer at the top of the list and leaves the choosing to them.

    A released model outranks a preview of the same number, since a preview is
    the one that will be retired first.
    """
    name = model.get("name", "")
    found = _VERSION.search(name.rsplit("/", 1)[-1])
    major = int(found.group(1)) if found else 0
    minor = int(found.group(2) or 0) if found else 0
    released = 0 if any(w in name for w in ("preview", "exp", "latest")) else 1
    return (-major, -minor, -released, name)
