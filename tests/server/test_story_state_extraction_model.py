import functools
import json
import unittest
from unittest import mock

import httpx
import torch
from parameterized import parameterized
from transformers import DynamicCache, Qwen3Config, Qwen3ForCausalLM

from server.models import cluster
from server.models import story_state_extraction_model
from server.models.story_state import StoryFact, StoryState
from server.models.story_state_extraction_model import (
    BASE_MODEL_PARAM,
    STORY_STATE_EXTRACTION_MODEL_BASE_MODEL,
    STORY_STATE_EXTRACTION_MODEL_FAMILY,
    STORY_STATE_EXTRACTION_MODEL_NAME,
    STORY_STATE_EXTRACTION_MODEL_SUFFIX,
    ExtractedStoryState,
    ServedStoryStateExtractionModel,
    StoryFactLabel,
    deploy_story_state_extraction_model,
    extracted_story_state,
    hidden_vector_after_the_story,
    label_of,
    read_the_line,
)


class ReadingTheStoryLineByLine(unittest.TestCase):
    def setUp(self) -> None:
        torch.manual_seed(0)
        self.model = Qwen3ForCausalLM(
            Qwen3Config(
                vocab_size=64,
                hidden_size=32,
                intermediate_size=64,
                num_hidden_layers=2,
                num_attention_heads=4,
                num_key_value_heads=2,
                head_dim=8,
                max_position_embeddings=256,
            )
        )
        self.model.eval()

    @parameterized.expand([
        ("one_line", [[5, 9, 12, 3, 40, 41]], [7, 7, 2]),
        ("three_lines", [[5, 9], [12, 3, 40], [41, 8, 8, 1]], [7, 7, 2]),
        ("one_token_lines", [[5], [9], [12], [3]], [30]),
        ("a_long_line_then_a_short_one", [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [11]], [20, 21, 22, 23]),
        ("a_candidate_longer_than_the_story", [[63]], [0, 1, 2, 3, 4, 5, 6, 7, 8]),
    ])
    def test_a_candidate_is_read_as_if_the_whole_story_came_with_it(
        self, _, lines, candidate
    ) -> None:
        story_read = DynamicCache(config=self.model.config)
        for line in lines:
            read_the_line(self.model, story_read, torch.tensor([line]))

        after_the_story = hidden_vector_after_the_story(
            self.model, story_read, torch.tensor([candidate])
        )

        with torch.inference_mode():
            read_in_full = self.model(
                input_ids=torch.tensor([sum(lines, []) + candidate]),
                output_hidden_states=True,
            ).hidden_states[-1][0, -1]
        torch.testing.assert_close(after_the_story, read_in_full, atol=1e-4, rtol=1e-4)

    @parameterized.expand([
        ("one_line_one_candidate", [[5, 9, 12]], [[7, 7]], 3),
        ("two_lines_two_candidates", [[5, 9], [12, 3, 40]], [[7], [8, 8, 8, 8]], 5),
        ("many_candidates", [[1, 2, 3, 4]], [[5], [6, 6], [7, 7, 7], [8, 8, 8, 8]], 4),
    ])
    def test_the_story_is_left_as_it_was_read_after_each_candidate(
        self, _, lines, candidates, expected_length
    ) -> None:
        story_read = DynamicCache(config=self.model.config)
        for line in lines:
            read_the_line(self.model, story_read, torch.tensor([line]))

        for candidate in candidates:
            hidden_vector_after_the_story(self.model, story_read, torch.tensor([candidate]))

        self.assertEqual(story_read.get_seq_length(), expected_length)

    @parameterized.expand([
        ("no_line_yet", [], 0),
        ("one_line", [[5, 9, 12]], 3),
        ("lines_of_different_lengths", [[5], [9, 12], [3, 40, 41, 8]], 7),
    ])
    def test_each_line_extends_the_story(self, _, lines, expected_length) -> None:
        story_read = DynamicCache(config=self.model.config)

        for line in lines:
            read_the_line(self.model, story_read, torch.tensor([line]))

        self.assertEqual(story_read.get_seq_length(), expected_length)


class LabelOfACandidate(unittest.TestCase):
    def setUp(self) -> None:
        self.head = torch.nn.Linear(4, 4, bias=False)
        with torch.no_grad():
            self.head.weight.copy_(torch.eye(4))

    @parameterized.expand([
        ("made_true", [0.9, 0.1, 0.0, 0.0], StoryFactLabel.MADE_TRUE),
        ("made_false", [0.1, 0.9, 0.0, 0.0], StoryFactLabel.MADE_FALSE),
        ("required", [0.0, 0.1, 0.9, 0.0], StoryFactLabel.REQUIRED),
        ("not_affected", [0.0, 0.0, 0.1, 0.9], StoryFactLabel.NOT_AFFECTED),
        ("all_scores_negative", [-3.0, -1.0, -2.0, -4.0], StoryFactLabel.MADE_FALSE),
        ("a_narrow_win", [0.500, 0.501, 0.499, 0.0], StoryFactLabel.MADE_FALSE),
        ("large_scores", [120.0, 30.0, 400.0, 399.0], StoryFactLabel.REQUIRED),
        ("the_last_label_wins", [-1.0, -1.0, -1.0, 0.0], StoryFactLabel.NOT_AFFECTED),
    ])
    def test_picks_the_label_the_head_scores_highest(
        self, _, hidden_vector, expected_label
    ) -> None:
        self.assertEqual(label_of(self.head, torch.tensor(hidden_vector)), expected_label)


class ExtractedStoryStateOfALine(unittest.TestCase):
    @parameterized.expand([
        (
            "no_candidates",
            [],
            [],
            ExtractedStoryState(change=StoryState(), requires=frozenset()),
        ),
        (
            "one_fact_made_true",
            [StoryFact("frank", "has met", "kaitlyn")],
            [StoryFactLabel.MADE_TRUE],
            ExtractedStoryState(
                change=StoryState(made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})),
                requires=frozenset(),
            ),
        ),
        (
            "one_fact_made_false",
            [StoryFact("frank", "candidate of", "kaitlyn")],
            [StoryFactLabel.MADE_FALSE],
            ExtractedStoryState(
                change=StoryState(
                    made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")})
                ),
                requires=frozenset(),
            ),
        ),
        (
            "one_fact_required",
            [StoryFact("kaitlyn", "owns", "frank")],
            [StoryFactLabel.REQUIRED],
            ExtractedStoryState(
                change=StoryState(),
                requires=frozenset({StoryFact("kaitlyn", "owns", "frank")}),
            ),
        ),
        (
            "one_fact_not_affected",
            [StoryFact("kaitlyn", "owns", "frank")],
            [StoryFactLabel.NOT_AFFECTED],
            ExtractedStoryState(change=StoryState(), requires=frozenset()),
        ),
        (
            "each_label_once",
            [
                StoryFact("frank", "works for", "kaitlyn"),
                StoryFact("frank", "candidate of", "kaitlyn"),
                StoryFact("frank", "has met", "kaitlyn"),
                StoryFact("kaitlyn", "owns", "frank"),
            ],
            [
                StoryFactLabel.MADE_TRUE,
                StoryFactLabel.MADE_FALSE,
                StoryFactLabel.REQUIRED,
                StoryFactLabel.NOT_AFFECTED,
            ],
            ExtractedStoryState(
                change=StoryState(
                    made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
                    made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
                ),
                requires=frozenset({StoryFact("frank", "has met", "kaitlyn")}),
            ),
        ),
        (
            "several_facts_share_each_label",
            [
                StoryFact("frank", "works for", "kaitlyn"),
                StoryFact("frank", "holds", "bottle"),
                StoryFact("frank", "candidate of", "kaitlyn"),
                StoryFact("the maitress", "holds", "bottle"),
                StoryFact("frank", "has met", "kaitlyn"),
                StoryFact("kaitlyn", "owns", "frank"),
            ],
            [
                StoryFactLabel.MADE_TRUE,
                StoryFactLabel.MADE_TRUE,
                StoryFactLabel.MADE_FALSE,
                StoryFactLabel.MADE_FALSE,
                StoryFactLabel.REQUIRED,
                StoryFactLabel.REQUIRED,
            ],
            ExtractedStoryState(
                change=StoryState(
                    made_true=frozenset(
                        {
                            StoryFact("frank", "works for", "kaitlyn"),
                            StoryFact("frank", "holds", "bottle"),
                        }
                    ),
                    made_false=frozenset(
                        {
                            StoryFact("frank", "candidate of", "kaitlyn"),
                            StoryFact("the maitress", "holds", "bottle"),
                        }
                    ),
                ),
                requires=frozenset(
                    {
                        StoryFact("frank", "has met", "kaitlyn"),
                        StoryFact("kaitlyn", "owns", "frank"),
                    }
                ),
            ),
        ),
        (
            "nothing_affected",
            [
                StoryFact("frank", "works for", "kaitlyn"),
                StoryFact("kaitlyn", "owns", "frank"),
            ],
            [StoryFactLabel.NOT_AFFECTED, StoryFactLabel.NOT_AFFECTED],
            ExtractedStoryState(change=StoryState(), requires=frozenset()),
        ),
    ])
    def test_sorts_the_candidates_by_their_labels(
        self, _, candidates, labels, expected_state
    ) -> None:
        self.assertEqual(extracted_story_state(candidates, labels), expected_state)


class DeployingTheStoryStateExtractionModel(unittest.TestCase):
    def setUp(self) -> None:
        patched = mock.patch.multiple(
            "server.story_analysis.story_state_extraction_model.cortexgrid",
            deploy_model=mock.DEFAULT,
        )
        self.cortexgrid = patched.start()
        self.addCleanup(patched.stop)

    @parameterized.expand([
        ("a_training_run", "trained-on-short-stories"),
        ("another_training_run", "trained-on-novels-2026-10-01"),
    ])
    def test_deploys_the_weights_the_named_run_trained_on_the_base_model(
        self, _, run_name
    ) -> None:
        deployment = deploy_story_state_extraction_model(run_name)

        self.cortexgrid["deploy_model"].assert_called_once_with(
            family=STORY_STATE_EXTRACTION_MODEL_FAMILY,
            suffix=STORY_STATE_EXTRACTION_MODEL_SUFFIX,
            run_name=run_name,
            timeout=cluster.DEPLOY_TIMEOUT_S,
            config={BASE_MODEL_PARAM: STORY_STATE_EXTRACTION_MODEL_BASE_MODEL},
        )
        self.assertIs(deployment, self.cortexgrid["deploy_model"].return_value)


class AskingTheServedModelForStoryStates(unittest.IsolatedAsyncioTestCase):
    @parameterized.expand([
        (
            "no_lines",
            [],
            [],
            "",
            {"lines": [], "candidates_of_each_line": []},
            [],
        ),
        (
            "one_line_one_candidate",
            ["She asked if he was Mr. Pulasky."],
            [[StoryFact("frank", "has met", "kaitlyn")]],
            '["made true"]\n',
            {
                "lines": ["She asked if he was Mr. Pulasky."],
                "candidates_of_each_line": [[["frank", "has met", "kaitlyn"]]],
            },
            [
                ExtractedStoryState(
                    change=StoryState(
                        made_true=frozenset({StoryFact("frank", "has met", "kaitlyn")})
                    ),
                    requires=frozenset(),
                ),
            ],
        ),
        (
            "each_line_gets_its_own_candidates_back",
            ["He was hired.", "The air conditioning hums.", "A fresh bottle for your Owner."],
            [
                [
                    StoryFact("frank", "works for", "kaitlyn"),
                    StoryFact("frank", "candidate of", "kaitlyn"),
                ],
                [],
                [StoryFact("kaitlyn", "owns", "frank")],
            ],
            '["made true", "made false"]\n[]\n["required"]\n',
            {
                "lines": [
                    "He was hired.",
                    "The air conditioning hums.",
                    "A fresh bottle for your Owner.",
                ],
                "candidates_of_each_line": [
                    [
                        ["frank", "works for", "kaitlyn"],
                        ["frank", "candidate of", "kaitlyn"],
                    ],
                    [],
                    [["kaitlyn", "owns", "frank"]],
                ],
            },
            [
                ExtractedStoryState(
                    change=StoryState(
                        made_true=frozenset({StoryFact("frank", "works for", "kaitlyn")}),
                        made_false=frozenset({StoryFact("frank", "candidate of", "kaitlyn")}),
                    ),
                    requires=frozenset(),
                ),
                ExtractedStoryState(change=StoryState(), requires=frozenset()),
                ExtractedStoryState(
                    change=StoryState(),
                    requires=frozenset({StoryFact("kaitlyn", "owns", "frank")}),
                ),
            ],
        ),
        (
            "every_candidate_not_affected",
            ["The air conditioning hums."],
            [
                [
                    StoryFact("frank", "works for", "kaitlyn"),
                    StoryFact("kaitlyn", "owns", "frank"),
                ]
            ],
            '["not affected", "not affected"]\n',
            {
                "lines": ["The air conditioning hums."],
                "candidates_of_each_line": [
                    [["frank", "works for", "kaitlyn"], ["kaitlyn", "owns", "frank"]]
                ],
            },
            [ExtractedStoryState(change=StoryState(), requires=frozenset())],
        ),
    ])
    async def test_sends_the_lines_with_their_candidates_and_reads_back_one_state_per_line(
        self, _, lines, candidates_of_each_line, answered, expected_body, expected_states
    ) -> None:
        server = mock.Mock(return_value=httpx.Response(200, text=answered))
        served_model = ServedStoryStateExtractionModel(
            url="http://serve/Authorship/storystateextractionmodel",
            model_id=STORY_STATE_EXTRACTION_MODEL_NAME,
        )

        with mock.patch.object(
            story_state_extraction_model.httpx,
            "AsyncClient",
            functools.partial(httpx.AsyncClient, transport=httpx.MockTransport(server)),
        ):
            result = [
                state
                async for state in served_model.story_states(lines, candidates_of_each_line)
            ]

        self.assertEqual(result, expected_states)
        self.assertEqual(
            str(server.call_args.args[0].url),
            "http://serve/Authorship/storystateextractionmodel/labels",
        )
        self.assertEqual(json.loads(server.call_args.args[0].content), expected_body)


if __name__ == "__main__":
    unittest.main()
