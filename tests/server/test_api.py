"""Tests for what happens when the writer saves again mid-build.

No model and no server: `Builds` is handed whatever answers `infer`, so a stub
that records what it was asked exercises the whole supersession path.
"""

import unittest
from pathlib import Path
from typing import Any

from server.api import Build, Builds, Superseded, graph_path_for


class StubWorker:
    """Stands in for the child process holding the weights."""

    def __init__(self, reply: str = "{}") -> None:
        self.reply = reply
        self.calls: list[str] = []
        self.interrupted: list[Build] = []
        #: Called with the build the model is generating for, so a test can
        #: abandon it from inside the generation it is abandoning.
        self.during: Any = None

    def infer(self, prompt: str, max_new_tokens: int, owner: Build | None = None) -> str:
        self.calls.append(prompt)
        if self.during is not None and owner is not None:
            self.during(owner)
        return self.reply

    def interrupt(self, owner: Build) -> None:
        self.interrupted.append(owner)


STORY = Path("/manuscripts/story.md")
OTHER = Path("/manuscripts/other.md")


class Supersession(unittest.TestCase):
    def test_a_second_save_abandons_the_first_build(self) -> None:
        model = StubWorker()
        builds = Builds(model)  # type: ignore[arg-type]

        first = builds.start(STORY)
        second = builds.start(STORY)

        self.assertTrue(first.abandoned)
        self.assertFalse(second.abandoned)

    def test_abandoning_reaches_the_generation_in_flight(self) -> None:
        # Setting the flag alone would leave the old build holding the model
        # until it hit its token budget, with the new one queued behind it.
        model = StubWorker()
        builds = Builds(model)  # type: ignore[arg-type]

        first = builds.start(STORY)
        builds.start(STORY)

        self.assertEqual(model.interrupted, [first])

    def test_manuscripts_do_not_abandon_each_other(self) -> None:
        model = StubWorker()
        builds = Builds(model)  # type: ignore[arg-type]

        story = builds.start(STORY)
        builds.start(OTHER)

        self.assertFalse(story.abandoned)
        self.assertEqual(model.interrupted, [])

    def test_a_superseded_build_does_not_retire_its_replacement(self) -> None:
        # The abandoned request unwinds after the one that replaced it started.
        model = StubWorker()
        builds = Builds(model)  # type: ignore[arg-type]

        first = builds.start(STORY)
        second = builds.start(STORY)
        builds.finish(first)

        third = builds.start(STORY)
        self.assertTrue(second.abandoned)
        self.assertIsNot(third, second)

    def test_finishing_clears_the_way_for_the_next_save(self) -> None:
        model = StubWorker()
        builds = Builds(model)  # type: ignore[arg-type]

        first = builds.start(STORY)
        builds.finish(first)
        builds.start(STORY)

        # Nothing to abandon: the first build was already done.
        self.assertEqual(model.interrupted, [])


class Inference(unittest.TestCase):
    def test_a_live_build_infers(self) -> None:
        model = StubWorker(reply="an answer")
        build = Build(STORY, model)  # type: ignore[arg-type]

        self.assertEqual(build.infer("a prompt", 16), "an answer")
        self.assertEqual(model.calls, ["a prompt"])

    def test_an_abandoned_build_does_not_reach_the_model(self) -> None:
        model = StubWorker()
        build = Build(STORY, model)  # type: ignore[arg-type]
        build.abandon()

        with self.assertRaises(Superseded):
            build.infer("a prompt", 16)
        self.assertEqual(model.calls, [])

    def test_a_reply_interrupted_mid_generation_is_not_an_answer(self) -> None:
        # An interrupted generation stops mid-sentence, so the reply must never
        # reach the parser — a half-written object is not a failed build, it is
        # a build nobody is waiting for.
        model = StubWorker(reply='{"nodes": [{"id": 1, "ti')
        model.during = lambda owner: owner.abandon()
        build = Build(STORY, model)  # type: ignore[arg-type]

        with self.assertRaises(Superseded):
            build.infer("a prompt", 16)

    def test_naming_the_manuscript_that_was_taken_over(self) -> None:
        build = Build(STORY, StubWorker())  # type: ignore[arg-type]
        build.abandon()

        with self.assertRaises(Superseded) as caught:
            build.check()
        self.assertIn("story.md", str(caught.exception))


class GraphPath(unittest.TestCase):
    def test_sits_beside_the_manuscript(self) -> None:
        self.assertEqual(
            graph_path_for(Path("/manuscripts/story_1.md")),
            Path("/manuscripts/story_1.graph.yaml"),
        )
