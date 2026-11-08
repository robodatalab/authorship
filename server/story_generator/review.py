"""The author's review of what the stages' steps produce, in a terminal: shown to
the author by chance, the less often the more the author trusts the stage, and
answered from the keyboard with a pass, a fail that says how to do it again, or
a stop."""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass
from enum import Enum

# How far every result the author approves moves the confidence in the stage
# towards certainty.
RISE = 0.2

# The most confidence there can be in a stage: at least one result in ten is
# still reviewed, so that a drift in the results is caught.
CAP = 0.9

STOP = "q"


class Verdict(Enum):
    ACCEPT = "accept"
    REVISE = "revise"
    STOP = "stop"


@dataclass(frozen=True)
class ReviewResult:
    """The author's answer to a result; when it is to be done again, the comment
    says how."""

    verdict: Verdict
    comment: str = ""

    @classmethod
    def success(cls) -> ReviewResult:
        return cls(Verdict.ACCEPT, "")

    @classmethod
    def failed(cls, reviewer_instruction: str = "") -> ReviewResult:
        return cls(Verdict.REVISE, reviewer_instruction)

    @classmethod
    def abort(cls) -> ReviewResult:
        return cls(Verdict.STOP, "")

    def is_passed(self) -> bool:
        return self.verdict == Verdict.ACCEPT

    def is_failed(self) -> bool:
        return self.verdict == Verdict.REVISE

    def is_aborted(self) -> bool:
        return self.verdict == Verdict.STOP


class TerminalReview:
    """The review of one stage's results, in a terminal, and the author's
    confidence in the stage: rising a fifth of the way towards certainty with
    every result the author approves, and halving with every result the author
    has done again; never above `CAP`."""

    def __init__(self, initial_confidence: float, chance: random.Random) -> None:
        self.confidence = initial_confidence
        self._chance = chance

    def __call__(self, *results: object) -> ReviewResult:
        """Whether the results pass. They are printed for the author by chance,
        the more likely the less the confidence, and pass unseen, and logged,
        otherwise."""
        logger = logging.getLogger(__name__)
        drawn = self._chance.random()
        if drawn >= 1 - self.confidence:
            logger.info("passed unreviewed, at confidence %.2f", self.confidence)
            unreviewed = ReviewResult.success()
            return unreviewed
        written_results = [f"{result}" for result in results]
        shown = "\n".join(written_results)
        print(f"\n{shown}\n")
        review_result = _answer()
        if review_result.is_failed():
            self.confidence = self.confidence / 2
            logger.info("confidence: %.2f", self.confidence)
        elif review_result.is_passed():
            risen = self.confidence + (1 - self.confidence) * RISE
            self.confidence = min(risen, CAP)
            logger.info("confidence: %.2f", self.confidence)
        return review_result

    def ask(self, question: str) -> str:
        """The author's answer to the question, as typed: line after line, until an
        empty line. Always asked, however confident the author is in the stage."""
        print(f"\n{question}\n")
        lines = []
        line = input("> ")
        while line:
            lines.append(line)
            line = input("> ")
        answer = "\n".join(lines)
        return answer


def _answer() -> ReviewResult:
    """The author's answer to a result, and what to change when it is to be done
    again."""
    typed = input(f"[a]ccept  [r]evise  [{STOP}] stop > ")
    choice = typed.strip().lower()
    while choice not in ("a", "r", STOP):
        typed = input(f"a, r or {STOP} > ")
        choice = typed.strip().lower()
    if choice == "a":
        accepted = ReviewResult.success()
        return accepted
    if choice == STOP:
        stopped = ReviewResult.abort()
        return stopped
    comment = input("What should change? > ")
    revised = ReviewResult.failed(comment)
    return revised
