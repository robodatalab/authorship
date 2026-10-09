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

DIFFERENT_SCENE_1 = """
I rushed up the steps of the church. The sky behind me was turning dark crimson.
Bursting through the door, I saw the priest finishing to chant the last encantations.
A huge, red glowing portal opened behind him, and a dark shadow appeared in its aperture.
From his place at the alter, the church bellowed: "Ah, Pierre, glad you could make it"
"""


SCENES = [SCENE_1, SCENE_2, SCENE_3, SCENE_4, SCENE_5, SCENE_6, DIFFERENT_SCENE_1]

EXPECTED_STATE = StoryState(
    characters=["Michael", "Sarah"],
    location="Michael and Sarah's home",
    event="knocking at the door",
    action="Michael Checks who knocks",
)
SCENE_SALIENT_CONCEPTS = ["Michael", "Sarah", "home", "surprise visitor"]

EXPECTED_STATE_DIFFERENT_SCENE = StoryState(
    characters=["Pierre", "Priest"],
    location="Church",
    event="summoning a deamon",
    action="Pierre bursts into the church",
)
DIFFERENT_SCENE_SALIENT_CONCEPTS = ["Pierre", "Priest", "deamon", "church", "summoning"]


async def test_scene(
        model: StoryStateExtractionModel, 
        scene_to_use_as_basis: str, 
        salient_concepts: list[str],
        reference_state: StoryState) -> None:
    basis = await model.encode_basis(
        scene_to_use_as_basis,
        salient_concepts=salient_concepts)
    
    ref_expected_state = await model.encode_from_state(basis, reference_state)
    encoding_the_scenes = [model.encode_from_text(basis, text) for text in SCENES]
    ref_states = await asyncio.gather(*encoding_the_scenes)

    similarity = [torch.dot(ref_expected_state, ref_state) for ref_state in ref_states]

    print(f"ref_expected_state = {ref_expected_state}")
    print(f"ref_states = {ref_states}")
    print(f"scene similarity = {similarity}")


def main() -> None:
    cortexgrid.Experiment.init(cluster.EXPERIMENT_NAME)

    deployment = StoryStateExtractionModel.deploy()
    model = deployment.client()

    asyncio.run(
        test_scene(
            model, 
            SCENE_1, 
            SCENE_SALIENT_CONCEPTS, 
            EXPECTED_STATE
        )
    )
    asyncio.run(
        test_scene(
            model, 
            DIFFERENT_SCENE_1, 
            DIFFERENT_SCENE_SALIENT_CONCEPTS, 
            EXPECTED_STATE_DIFFERENT_SCENE
        )
    )


if __name__ == "__main__":
    main()
