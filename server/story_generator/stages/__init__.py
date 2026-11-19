"""The stages of writing a story, one per module, in the order the workflow runs
them.

The stages run one after another, each on what the ones before it wrote:

    concept titles → concepts → cast → characters → plot ends → mesh → scenes → choices → validity

The story is built from its concepts: the author adds them; the author casts
the main characters, and each is rolled a backstory from the character tables
of the genres the concepts suggest; every concept gets a plot that
follows its characters, begun as its start and its goal; the mesh fills every plot in between, so
that the plots meet; every scene is built from versions dedicated to the
concepts of its events' plots, merged between the concepts' markers; and the
choices that end the scenes come after them. Last, the story is played as the
benchmark plays it, to check that it does what the benchmark needs of it."""

from collections.abc import Callable
from random import Random

import cortexgrid
from cortexgrid_infer import CompletingModel
from server.story_generator.character_tables import CharacterTables
from server.story_generator.stage import Stage
from server.story_generator.stages.characters import Cast, Characters
from server.story_generator.stages.choices import Choices
from server.story_generator.stages.concepts import Concepts, ConceptTitles
from server.story_generator.stages.mesh import Mesh
from server.story_generator.stages.plots import Plots
from server.story_generator.stages.scenes import Scenes
from server.story_generator.stages.validity import Validity


def _characters(deployment: cortexgrid.Deployment[CompletingModel]) -> Stage:
    tables = CharacterTables.loaded()
    random = Random()
    characters = Characters(deployment, tables, random)
    return characters


STAGES_BY_NAME: dict[str, Callable[[cortexgrid.Deployment[CompletingModel]], Stage]] = {
    "concept titles": lambda _: ConceptTitles(),
    "concepts": Concepts,
    "cast": lambda _: Cast(),
    "characters": _characters,
    "plots": Plots,
    "mesh": Mesh,
    "scenes": Scenes,
    "choices": Choices,
    "validity": lambda _: Validity(),
}
