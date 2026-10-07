import asyncio

import cortexgrid
import numpy as np
import torch

from server.models import cluster
from server.models.story_state_extraction_model import (
    StoryStateExtractionModel, 
    StoryState
)

SCENE_1 = """It was a warm, sunny day.
Michael and Sarah were just heading out for a walk, when they'd heard knocking at their door. They weren't expecting a soul.
"Keep getting ready, while I check" Michael left the room.
She heard his footsteps on the stairs, and the squeaking of the front door. She continued brushing her hair, looking at her freckly skin in the mirror. After a few seconds, when she heard no sounds, she yelled
"Who is it hon?"
But no answer came."""

SCENE_2 = """Michael and Sarah were just heading out for a walk, when they'd heard knocking at their door. They weren't expecting a soul.
"Keep getting ready, while I check" Michael left the room.
She heard his footsteps on the stairs, and the squeaking of the front door. She continued brushing her hair, looking at her freckly skin in the mirror. After a few seconds, when she heard no sounds, she yelled
"Who is it hon?"
But no answer came."""

SCENE_3 = """It was a warm, sunny day.
Michael and Sarah were just heading out, when they'd heard knocking at their door. They weren't expecting a soul.
"Keep getting ready, while I check" Michael left the room.
She heard his footsteps on the stairs, and the squeaking of the front door. She continued brushing her hair, looking at her freckly skin in the mirror. After a few seconds, when she heard no sounds, she yelled
"Who is it hon?"
But no answer came."""

SCENE_4 = """It was a warm, sunny day.
Michael and Sarah were just heading out for a walk, when they'd heard knocking at their door.
She heard his footsteps on the stairs, and the squeaking of the front door. She continued brushing her hair, looking at her freckly skin in the mirror. After a few seconds, when she heard no sounds, she yelled
"Who is it hon?"
But no answer came."""

SCENE_5 = """It was a warm, sunny day.
Michael and Sarah were just heading out for a walk, when they'd heard knocking at their door.
She heard his footsteps on the stairs, and the squeaking of the front door. She continued brushing her hair, looking at her freckly skin in the mirror."""

SCENE_6 = """It was a warm, sunny day.
Michael and Sarah were just heading out for a walk, when they'd heard knocking at their door.
She heard his footsteps on the stairs, and the squeaking of the front door. She continued brushing her hair, looking at her freckly skin in the mirror. After a few seconds she yelled
"Who is it hon?"""

SCENES = [SCENE_1, SCENE_2, SCENE_3, SCENE_4, SCENE_5, SCENE_6]

EXPECTED_STATE = StoryState(
    characters=["Michael", "Sarah"],
    location="Michael and Sarah's home",
    event="knocking at the door",
    action="Michael Checks who knocks",
)


async def run_test(model: StoryStateExtractionModel) -> None:
    basis = await model.encode_basis(SCENE_1)
    
    ref_expected_state = await model.encode_from_state(basis, EXPECTED_STATE)
    ref_states = [model.encode_from_text(basis, text) for text in SCENES]

    similarity = [torch.dot(ref_expected_state, ref_state) for ref_state in ref_states]

    print(similarity)


def main() -> None:
    cortexgrid.Experiment.init(cluster.EXPERIMENT_NAME)

    deployment = StoryStateExtractionModel.deploy()
    model = deployment.client()

    asyncio.run(run_test(model))


if __name__ == "__main__":
    main()
