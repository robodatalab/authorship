from __future__ import annotations

from pathlib import Path

import cortexgrid
from cortexgrid_infer import detect_device
from cortexgrid_train import train_with_loss
from peft import LoraConfig, get_peft_model
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from experiments.story_state_extraction_training.dataset import (
    AnnotatedStorySpansDataset,
)
from server import storydoc
from server.models import cluster
from server.models.long_context_qwen import LONG_CONTEXT_QWEN
from server.models.story_state_extraction_model import (
    StorySpaceEncoder,
    StoryStateExtractionModel,
    volume_loss,
)
from server.storydoc import Document

STORIES_REPOSITORY = Path.home() / "GitHub" / "smut"

TRAINED_STORY_SPACE_DIRECTORY = "story_space"

STORY_SPACE_ADAPTER = LoraConfig(
    r=1,
    lora_alpha=32,
    target_modules=[
        "q_proj",
        "k_proj",
        "v_proj",
        "o_proj",
        "gate_proj",
        "up_proj",
        "down_proj",
    ],
)

LEARNING_RATE = 1e-4
BATCH_SIZE = 4
EPOCHS = 3


def train_story_space(annotated_stories: list[Document]) -> None:
    qwen_weights = cortexgrid.load_model(
        LONG_CONTEXT_QWEN.family, LONG_CONTEXT_QWEN.suffix, cortexgrid.IMPORTED
    )
    tokenizer = AutoTokenizer.from_pretrained(qwen_weights)
    qwen = AutoModelForCausalLM.from_pretrained(qwen_weights, dtype=torch.bfloat16)
    device = detect_device()
    qwen.to(device)
    adapted_qwen = get_peft_model(qwen, STORY_SPACE_ADAPTER)
    story_space_encoder = StorySpaceEncoder(adapted_qwen, tokenizer)
    annotated_story_spans = AnnotatedStorySpansDataset(annotated_stories)
    trained_story_space_encoder = train_with_loss(
        story_space_encoder,
        annotated_story_spans,
        loss_fn=volume_loss,
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        lr=LEARNING_RATE,
    )
    trained_story_space_encoder.save_pretrained(TRAINED_STORY_SPACE_DIRECTORY)
    requirements = StoryStateExtractionModel.requirements()
    cortexgrid.save_model(
        TRAINED_STORY_SPACE_DIRECTORY,
        StoryStateExtractionModel,
        family="Authorship",
        suffix="storystateextractionmodel",
        requirements=requirements,
    )


def main() -> None:
    cortexgrid.Experiment.init(cluster.EXPERIMENT_NAME)
    cluster.ensure_weights_imported(LONG_CONTEXT_QWEN)
    author_files = [
        path
        for path in STORIES_REPOSITORY.rglob(f"*{storydoc.EXTENSION}")
        if path.is_file()
    ]
    story_documents = [Document.load(path) for path in author_files]
    annotated_stories = [
        document for document in story_documents if document.salient_concepts()
    ]
    training = cortexgrid.remote(
        train_story_space, annotated_stories, num_gpus=1, retry=True
    )
    training.result()


if __name__ == "__main__":
    main()
