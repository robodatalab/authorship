import unittest
from unittest import mock

import cortexgrid
import torch
from transformers import Qwen3Config, Qwen3ForCausalLM

from server.models import cluster
from server.story_analysis.story_plot_classifier import (
    BASE_MODEL_PARAM,
    STORY_PLOT_CLASSIFIER_BASE_MODEL,
    STORY_PLOT_CLASSIFIER_FAMILY,
    STORY_PLOT_CLASSIFIER_SUFFIX,
    StoryPlotClassifier,
    answer_logits_after_the_story,
    deploy_story_plot_classifier,
    probability_of_yes,
    read_the_story,
)


def tiny_qwen3() -> Qwen3ForCausalLM:
    torch.manual_seed(0)
    model = Qwen3ForCausalLM(
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
    model.eval()
    return model


class ReadingTheStoryOnce(unittest.TestCase):
    def test_every_question_is_answered_as_if_the_story_were_read_with_it(
        self,
    ) -> None:
        model = tiny_qwen3()
        story_ids = torch.randint(0, 64, (1, 40))
        questions = [torch.randint(0, 64, (1, length)) for length in (5, 9, 3)]

        story_read = read_the_story(model, story_ids)
        answered_after_the_story = [
            answer_logits_after_the_story(model, story_read, question_ids)
            for question_ids in questions
        ]

        with torch.inference_mode():
            answered_in_full = [
                model(input_ids=torch.cat([story_ids, question_ids], dim=-1)).logits[
                    0, -1
                ]
                for question_ids in questions
            ]
        for after_the_story, in_full in zip(answered_after_the_story, answered_in_full):
            torch.testing.assert_close(after_the_story, in_full, atol=1e-4, rtol=1e-4)

    def test_the_story_is_left_as_it_was_read_after_each_question(self) -> None:
        model = tiny_qwen3()
        story_read = read_the_story(model, torch.randint(0, 64, (1, 40)))

        answer_logits_after_the_story(model, story_read, torch.randint(0, 64, (1, 7)))

        self.assertEqual(story_read.get_seq_length(), 40)


class ProbabilityOfYes(unittest.TestCase):
    def test_weighs_every_spelling_of_yes_against_every_spelling_of_no(self) -> None:
        answer_logits = torch.full((10,), -20.0)
        answer_logits[[1, 2]] = torch.log(torch.tensor([0.3, 0.3]))
        answer_logits[[3, 4]] = torch.log(torch.tensor([0.1, 0.1]))

        self.assertAlmostEqual(
            probability_of_yes(answer_logits, yes_ids=[1, 2], no_ids=[3, 4]),
            0.75,
            places=5,
        )


class DeployingTheClassifier(unittest.TestCase):
    def setUp(self) -> None:
        patched = mock.patch.multiple(
            "server.story_analysis.story_plot_classifier.cortexgrid",
            Experiment=mock.DEFAULT,
            remote=mock.DEFAULT,
            register_model=mock.DEFAULT,
            deploy_model=mock.DEFAULT,
        )
        self.cortexgrid = patched.start()
        self.addCleanup(patched.stop)
        self.cortexgrid["deploy_model"].return_value = mock.Mock(
            url="http://serve/Authorship/storyplotclassifier"
        )

    def test_stages_the_base_model_it_is_built_on(self) -> None:
        deploy_story_plot_classifier()

        job, *arguments = self.cortexgrid["remote"].call_args.args
        self.assertIs(job, cluster.import_weights)
        self.assertEqual(arguments[0].model_id, STORY_PLOT_CLASSIFIER_BASE_MODEL)
        self.cortexgrid["remote"].return_value.result.assert_called_once()

    def test_is_registered_under_its_own_name_with_no_weights_of_its_own(self) -> None:
        deploy_story_plot_classifier()

        self.cortexgrid["register_model"].assert_called_once_with(
            StoryPlotClassifier,
            family=STORY_PLOT_CLASSIFIER_FAMILY,
            suffix=STORY_PLOT_CLASSIFIER_SUFFIX,
            requirements=StoryPlotClassifier.requirements(),
        )

    def test_is_deployed_from_the_registry_on_the_base_model_it_was_built_on(
        self,
    ) -> None:
        deployment = deploy_story_plot_classifier()

        self.cortexgrid["deploy_model"].assert_called_once_with(
            family=STORY_PLOT_CLASSIFIER_FAMILY,
            suffix=STORY_PLOT_CLASSIFIER_SUFFIX,
            run_name=cortexgrid.IMPORTED,
            wait=True,
            timeout=cluster.DEPLOY_TIMEOUT_S,
            config={BASE_MODEL_PARAM: STORY_PLOT_CLASSIFIER_BASE_MODEL},
        )
        self.assertIs(deployment, self.cortexgrid["deploy_model"].return_value)


if __name__ == "__main__":
    unittest.main()
