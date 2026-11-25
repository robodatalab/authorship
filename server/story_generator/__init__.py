"""Writing an interactive story with its author, stage by stage: from what the
story is about, its salient concepts, to the scenes that show them. The stages
are in `stages`; the editor runs them in order."""

from server.story_generator.job import StoryGenerationJob
from server.story_generator.stages import STAGES_BY_NAME

__all__ = [
    "STAGES_BY_NAME",
    "StoryGenerationJob",
]
