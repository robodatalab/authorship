import functools
import json
import unittest
from unittest import mock

import cortexgrid
import httpx
from cortexgrid_infer import CompletionChunk
from parameterized import parameterized

from server.models import cluster, story_state_extraction_model
from server.models.story_state import StoryFact, StoryState
from server.models.story_state_extraction_model import (
    SCENE_CONTINUATION_INSTRUCTION,
    STORY_STATE_EXTRACTION_INSTRUCTION,
    STORY_STATE_EXTRACTION_MODEL_FAMILY,
    STORY_STATE_EXTRACTION_MODEL_SUFFIX,
    ServedStoryStateExtractionModel,
    StoryStateExtractionModel,
    deploy_story_state_extraction_model,
    story_state_of,
)


class ReadingTheStoryStateFromTheAnswer(unittest.TestCase):
    @parameterized.expand([
        ("nothing", "", StoryState()),
        (
            "true_and_false_facts",
            "true: Ann | is in | the kitchen\nfalse: the door | is | locked\n",
            StoryState(
                made_true=frozenset({StoryFact("Ann", "is in", "the kitchen")}),
                made_false=frozenset({StoryFact("the door", "is", "locked")}),
            ),
        ),
        (
            "a_line_that_is_not_a_statement_is_skipped",
            "Here is the state:\ntrue: Ann | holds | the key",
            StoryState(made_true=frozenset({StoryFact("Ann", "holds", "the key")})),
        ),
        (
            "a_fact_without_three_parts_is_skipped",
            "true: Ann | is happy\nfalse: Bob | has | the key",
            StoryState(made_false=frozenset({StoryFact("Bob", "has", "the key")})),
        ),
        (
            "a_fact_with_an_empty_part_is_skipped",
            "true: Her | arm lifts |\ntrue: She | holds | a dress",
            StoryState(made_true=frozenset({StoryFact("She", "holds", "a dress")})),
        ),
        (
            "a_statement_neither_true_nor_false_is_skipped",
            "maybe: Ann | is in | the kitchen",
            StoryState(),
        ),
    ])
    def test_reads_each_true_and_false_statement(self, _, answer, expected_state) -> None:
        self.assertEqual(story_state_of(answer), expected_state)


class AnsweringWithTheStoryState(unittest.IsolatedAsyncioTestCase):
    async def test_asks_the_long_context_model_what_is_true_where_the_story_stops(self) -> None:
        long_context_qwen = mock.Mock()
        long_context_qwen.complete.return_value = mock.MagicMock(**{
            "__aiter__.return_value": [
                CompletionChunk(content="true: Ann | is in | "),
                CompletionChunk(content="the kitchen\nfalse: the door | is | locked"),
            ]
        })
        with mock.patch.object(
            story_state_extraction_model.cortexgrid,
            "required_models",
            return_value=[mock.Mock(url="http://serve/Qwen/Qwen3-8B")],
        ), mock.patch.object(
            story_state_extraction_model.Text2Text, "client", return_value=long_context_qwen
        ):
            model = StoryStateExtractionModel(
                cortexgrid.DeploymentKey("Authorship", "storystateextractionmodel", "imported")
            )

        story_state = await model.story_state(
            {"story_before_the_scene": "Ann came home late.", "scene": "Ann walked into the kitchen."}
        )

        self.assertEqual(
            story_state,
            StoryState(
                made_true=frozenset({StoryFact("Ann", "is in", "the kitchen")}),
                made_false=frozenset({StoryFact("the door", "is", "locked")}),
            ),
        )
        long_context_qwen.complete.assert_called_once_with(
            [
                {"role": "system", "content": STORY_STATE_EXTRACTION_INSTRUCTION},
                {
                    "role": "user",
                    "content": "Ann came home late.\n<scene>\nAnn walked into the kitchen.\n</scene>",
                },
            ],
            max_new_tokens=1024,
            temperature=0.0,
        )


class AskingWhetherEachLineContinuesTheScene(unittest.IsolatedAsyncioTestCase):
    async def test_asks_about_every_line_after_the_first_with_the_story_read_up_to_it(self) -> None:
        long_context_qwen = mock.Mock()
        long_context_qwen.loglikelihoods = mock.AsyncMock(side_effect=[
            [-0.2876820724517809], [-1.3862943611198906],
            [-1.3862943611198906], [-0.2876820724517809],
        ])
        with mock.patch.object(
            story_state_extraction_model.cortexgrid,
            "required_models",
            return_value=[mock.Mock(url="http://serve/Qwen/Qwen3-8B")],
        ), mock.patch.object(
            story_state_extraction_model.Text2Text, "client", return_value=long_context_qwen
        ):
            model = StoryStateExtractionModel(
                cortexgrid.DeploymentKey("Authorship", "storystateextractionmodel", "imported")
            )

        response = await model.scene_continuation_probabilities(
            {"lines": ["She tries on a dress.", "He zips it up.", "Years later, he was hired."]}
        )
        answered = [line async for line in response.body_iterator]

        self.assertEqual(answered, ["0.75\n", "0.25\n"])
        self.assertEqual(
            [call.args[0] for call in long_context_qwen.loglikelihoods.call_args_list],
            [
                [
                    {"role": "system", "content": SCENE_CONTINUATION_INSTRUCTION},
                    {
                        "role": "user",
                        "content": "<story>\nShe tries on a dress.\n\nHe zips it up.\n</story>\n\n"
                        "The story stops at the line: He zips it up.\n"
                        "Does that line continue the scene of the lines before it, with the same "
                        "characters in the same place at the same time, rather than begin a new scene?\n"
                        "Answer:",
                    },
                ],
            ] * 2 + [
                [
                    {"role": "system", "content": SCENE_CONTINUATION_INSTRUCTION},
                    {
                        "role": "user",
                        "content": "<story>\nShe tries on a dress.\n\nHe zips it up.\n\n"
                        "Years later, he was hired.\n</story>\n\n"
                        "The story stops at the line: Years later, he was hired.\n"
                        "Does that line continue the scene of the lines before it, with the same "
                        "characters in the same place at the same time, rather than begin a new scene?\n"
                        "Answer:",
                    },
                ],
            ] * 2,
        )
        self.assertEqual(
            [call.args[1] for call in long_context_qwen.loglikelihoods.call_args_list],
            [["Yes", " Yes"], ["No", " No"], ["Yes", " Yes"], ["No", " No"]],
        )


class AskingTheServedModelWhereScenesEnd(unittest.IsolatedAsyncioTestCase):
    async def test_sends_the_lines_and_reads_back_a_probability_per_line_after_the_first(self) -> None:
        server = mock.Mock(return_value=httpx.Response(200, content=b"0.75\n0.25\n"))
        served_model = ServedStoryStateExtractionModel(
            "http://serve/Authorship/storystateextractionmodel",
            "Authorship-storystateextractionmodel",
        )
        with mock.patch.object(
            story_state_extraction_model.httpx,
            "AsyncClient",
            functools.partial(httpx.AsyncClient, transport=httpx.MockTransport(server)),
        ):
            probabilities = [
                probability
                async for probability in served_model.scene_continuation_probabilities(
                    ["She tries on a dress.", "He zips it up.", "Years later, he was hired."]
                )
            ]

        self.assertEqual(probabilities, [0.75, 0.25])
        self.assertEqual(
            str(server.call_args.args[0].url),
            "http://serve/Authorship/storystateextractionmodel/scene_continuation_probabilities",
        )
        self.assertEqual(
            json.loads(server.call_args.args[0].content),
            {"lines": ["She tries on a dress.", "He zips it up.", "Years later, he was hired."]},
        )


class AskingTheServedModelForTheStoryState(unittest.IsolatedAsyncioTestCase):
    async def test_sends_the_story_and_reads_back_the_story_state(self) -> None:
        server = mock.Mock(return_value=httpx.Response(200, json={
            "made_true": [{"subject": "Ann", "relation": "is in", "object": "the kitchen"}],
            "made_false": [{"subject": "the door", "relation": "is", "object": "locked"}],
        }))
        served_model = ServedStoryStateExtractionModel(
            "http://serve/Authorship/storystateextractionmodel",
            "Authorship-storystateextractionmodel",
        )
        with mock.patch.object(
            story_state_extraction_model.httpx,
            "AsyncClient",
            functools.partial(httpx.AsyncClient, transport=httpx.MockTransport(server)),
        ):
            story_state = await served_model.story_state(
                "Ann came home late.", "Ann walked into the kitchen."
            )

        self.assertEqual(
            story_state,
            StoryState(
                made_true=frozenset({StoryFact("Ann", "is in", "the kitchen")}),
                made_false=frozenset({StoryFact("the door", "is", "locked")}),
            ),
        )
        self.assertEqual(
            str(server.call_args.args[0].url),
            "http://serve/Authorship/storystateextractionmodel/story_state",
        )
        self.assertEqual(
            json.loads(server.call_args.args[0].content),
            {"story_before_the_scene": "Ann came home late.", "scene": "Ann walked into the kitchen."},
        )


class DeployingTheStoryStateExtractionModel(unittest.TestCase):
    def setUp(self) -> None:
        patched = mock.patch.multiple(
            "server.models.story_state_extraction_model.cortexgrid",
            register_model=mock.DEFAULT,
            deploy_model=mock.DEFAULT,
        )
        self.cortexgrid = patched.start()
        self.addCleanup(patched.stop)

    def test_is_registered_under_its_own_name_with_no_weights_of_its_own(self) -> None:
        deploy_story_state_extraction_model()

        self.cortexgrid["register_model"].assert_called_once_with(
            StoryStateExtractionModel,
            family=STORY_STATE_EXTRACTION_MODEL_FAMILY,
            suffix=STORY_STATE_EXTRACTION_MODEL_SUFFIX,
            requirements=StoryStateExtractionModel.requirements(),
        )

    def test_is_deployed_from_the_registry(self) -> None:
        deployment = deploy_story_state_extraction_model()

        self.cortexgrid["deploy_model"].assert_called_once_with(
            family=STORY_STATE_EXTRACTION_MODEL_FAMILY,
            suffix=STORY_STATE_EXTRACTION_MODEL_SUFFIX,
            run_name=cortexgrid.IMPORTED,
            timeout=cluster.DEPLOY_TIMEOUT_S,
        )
        self.assertIs(deployment, self.cortexgrid["deploy_model"].return_value)


if __name__ == "__main__":
    unittest.main()
