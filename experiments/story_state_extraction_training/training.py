from __future__ import annotations

import random
import shutil
import tempfile
from pathlib import Path

import cortexgrid
from cortexgrid_train import train_from_model_output

from experiments.story_state_extraction_training.dataset import (
    SalientConceptsDataset,
)
from experiments.story_state_extraction_training.loss import salient_point_classification_loss
from server import storydoc
from server.models import cluster
from server.models.story_state_extraction_model import StoryStateExtractionModel
from server.storydoc import Document

STORIES_REPOSITORY = Path.home() / "GitHub" / "smut"

ANNOTATED_STORIES_DATASET = "annotated-stories"

STORY_SPACE_FAMILY = "Authorship"
STORY_SPACE_SUFFIX = "storystateextractionmodel"

STORY_SPACE_TRAINING_REQUIREMENTS = cortexgrid.ModelRequirements(
    num_gpus=1, ram_gb=20.0, vram_gb=32.0
)

LEARNING_RATE = 1e-4
BATCH_SIZE = 4
EPOCHS = 3


def train_story_space() -> None:
    annotated_stories_dir = cortexgrid.load_dataset(ANNOTATED_STORIES_DATASET)
    annotated_story_files = annotated_stories_dir.rglob(f"*{storydoc.EXTENSION}")
    annotated_stories = [Document.load(path) for path in annotated_story_files]
    story_state_extraction_model = cortexgrid.instantiate_model(
        STORY_SPACE_FAMILY, STORY_SPACE_SUFFIX, cortexgrid.IMPORTED
    )
    drawing_examples = random.Random()
    salient_concepts = SalientConceptsDataset(annotated_stories, drawing_examples)
    trained_story_state_extraction_model = train_from_model_output(
        story_state_extraction_model,
        salient_concepts,
        salient_point_classification_loss,
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        lr=LEARNING_RATE,
    )
    requirements = StoryStateExtractionModel.requirements()
    with tempfile.TemporaryDirectory() as story_space_weights_dir:
        trained_story_state_extraction_model.save_weights(story_space_weights_dir)
        cortexgrid.save_model(
            story_space_weights_dir,
            StoryStateExtractionModel,
            family=STORY_SPACE_FAMILY,
            suffix=STORY_SPACE_SUFFIX,
            requirements=requirements,
        )


def save_annotated_stories_dataset() -> None:
    author_files = [
        path
        for path in STORIES_REPOSITORY.rglob(f"*{storydoc.EXTENSION}")
        if path.is_file()
    ]
    story_documents = [Document.load(path) for path in author_files]
    annotated_story_files = [
        path
        for path, document in zip(author_files, story_documents)
        if document.salient_concepts()
    ]
    with tempfile.TemporaryDirectory() as annotated_stories_dir:
        staging_root = Path(annotated_stories_dir)
        for annotated_story_file in annotated_story_files:
            path_in_the_repository = annotated_story_file.relative_to(STORIES_REPOSITORY)
            staged_file = staging_root / path_in_the_repository
            staged_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(annotated_story_file, staged_file)
        cortexgrid.save_dataset(annotated_stories_dir, ANNOTATED_STORIES_DATASET)


def main() -> None:
    cortexgrid.Experiment.init(cluster.EXPERIMENT_NAME)
    requirements = StoryStateExtractionModel.requirements()
    cortexgrid.register_model(
        StoryStateExtractionModel,
        family=STORY_SPACE_FAMILY,
        suffix=STORY_SPACE_SUFFIX,
        requirements=requirements,
    )
    save_annotated_stories_dataset()
    training = cortexgrid.remote(
        train_story_space,
        requirements=STORY_SPACE_TRAINING_REQUIREMENTS,
        retry=True,
    )
    training.result()


if __name__ == "__main__":
    main()
