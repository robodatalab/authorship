from __future__ import annotations

import os
import re
from typing import Any

import httpx

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-3.1-pro-preview"
KEY_VARIABLE = "GEMINI_API_KEY"
MODEL_VARIABLE = "GEMINI_MODEL"
TIMEOUT_S = 600.0
SAFETY_SETTINGS = [
    {"category": category, "threshold": "BLOCK_NONE"}
    for category in (
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
    )
]
_PAGE = 1000
_ZERO_LIMIT = re.compile(r"limit:\s*0\b")
_VERSION = re.compile(r"(\d+)(?:\.(\d+))?")


class GeminiError(RuntimeError):
    def __init__(
        self,
        detail: str,
        unauthorized: bool = False,
        no_quota: bool = False,
        transient: bool = False,
        truncated: bool = False,
        refused: bool = False,
    ) -> None:
        super().__init__(detail)
        self.unauthorized = unauthorized
        self.truncated = truncated
        self.refused = refused
        self.no_quota = no_quota
        self.transient = transient

    @property
    def one_chapter(self) -> bool:
        return self.truncated or self.refused


def configured_key(given: str | None = None) -> str | None:
    return given or os.environ.get(KEY_VARIABLE) or None


def configured_model(given: str | None = None) -> str:
    return given or os.environ.get(MODEL_VARIABLE) or DEFAULT_MODEL


class Gemini:

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
        body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": instruction}]},
            "contents": [{"role": "user", "parts": [{"text": said}]}],
            "safetySettings": SAFETY_SETTINGS,
            "generationConfig": {"temperature": temperature},
        }
        if max_new_tokens is not None:
            body["generationConfig"]["maxOutputTokens"] = max_new_tokens

        result = self._call("POST", f"models/{self.model_id}:generateContent", json=body)
        return _answer(result)

    def models(self) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        page: str | None = None
        while True:
            asked = f"models?pageSize={_PAGE}"
            if page:
                asked += f"&pageToken={page}"
            answer = self._call(method="GET", path=asked)
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

    def health_check(self) -> bool:
        try:
            self._call(
                method="POST",
                path=f"models/{self.model_id}:generateContent",
                json={
                    "contents": [{"role": "user", "parts": [{"text": "Say OK."}]}],
                    "generationConfig": {"maxOutputTokens": 16},
                },
            )
        except GeminiError as err:
            if err.transient:
                return False
            raise

        return True

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
            raise _refusal(response)
        return dict(response.json())


def _refusal(response: httpx.Response) -> GeminiError:
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
        return GeminiError(detail, transient=True)
    if response.status_code in (500, 502, 503, 504):
        return GeminiError(detail, transient=True)
    return GeminiError(detail)


def _details(error: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    return [
        part
        for part in (error.get("details") or [])
        if isinstance(part, dict) and str(part.get("@type", "")).endswith(kind)
    ]


def _allows_none(error: dict[str, Any], said: str | None) -> bool:
    for failure in _details(error, "QuotaFailure"):
        for violation in failure.get("violations") or []:
            if str(violation.get("quotaValue", "")).strip() == "0":
                return True
    return bool(said) and _ZERO_LIMIT.search(said or "") is not None


def _answer(body: dict[str, Any]) -> str:
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
    if reason not in ("", "STOP"):
        raise GeminiError(
            f"Gemini stopped before it had finished ({reason}), so what it wrote "
            "is part of a chapter and has been thrown away.",
            truncated=True,
        )
    return said


def _refused_reading(blocked: str) -> str:
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


def _newest_first(model: dict[str, Any]) -> tuple[int, int, int, str]:
    name = model.get("name", "")
    found = _VERSION.search(name.rsplit("/", 1)[-1])
    major = int(found.group(1)) if found else 0
    minor = int(found.group(2) or 0) if found else 0
    released = 0 if any(w in name for w in ("preview", "exp", "latest")) else 1
    return (-major, -minor, -released, name)
