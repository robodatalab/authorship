import asyncio

import cortexgrid

from server.models import cluster
from server.models.story_state_extraction_model import StoryStateExtractionModel

STORY_BEFORE_THE_SCENE = """It was a warm, sunny day.

Michael and Sarah were just heading out for a walk, when they'd heard knocking at their door. They weren't expecting a soul.

"Keep getting ready, while I check" Michael left the room."""

SCENE = """She heard his footsteps on the stairs, and the squeaking of the front door. She continued brushing her hair, looking at her freckly skin in the mirror. After a few seconds, when she heard no sounds, she yelled

"Who is it hon?"

But no answer came."""


def main() -> None:
    cortexgrid.Experiment.init(cluster.EXPERIMENT_NAME)

    deployment = StoryStateExtractionModel.deploy()
    story_state_extraction_model = deployment.client()


    asking_for_the_story_state = story_state_extraction_model.story_state(
        STORY_BEFORE_THE_SCENE, SCENE
    )
    story_state = asyncio.run(asking_for_the_story_state)
    print(story_state)


if __name__ == "__main__":
    main()
