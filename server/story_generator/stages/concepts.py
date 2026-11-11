"""The story's salient concepts: what the story is about, kept as its salient
concept cells, first in the story. The author adds the concepts of their
choosing in the Salient Concepts tab; then the model describes every one of them,
in the light of the others, as what it is really about and in what light the
story shows it. The model adds no concept: the story is about what the author
chose. The author reviews the descriptions in the Salient Concepts tab.

A concept is an idea, not a thing that appears in the story: a general theme the
story is built on, such as motherhood or war, or a story-specific hook, such as
a stranger stranded under the surface of Mars. Every concept gets a plot of its
own, and every plot respects every concept.

The model writes every concept as its title on a line of its own, opened with
"### ", followed by its description:

    ### Motherhood
    A mother's care for her child, shown in the light of what it costs her.
"""

from __future__ import annotations

import re

from authordoc.cells.salient_concept_cell import SALIENT_CONCEPT, SalientConceptCell
from authordoc.storydoc import Document
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from cortexgrid_infer import CompletingModel
from server.story_generator.review import CommandShown, Shown, TabShown
from server.story_generator.stage import Stage, StageStep

# Where the author adds the concepts: the Salient Concepts tab's add button.
ADD_THE_CONCEPTS = CommandShown(SALIENT_CONCEPT, "addStoryAnnotation")

DESCRIPTION_INSTRUCTIONS = """You help an author describe what an interactive story is about: its salient concepts, the ideas a reader should come away understanding, though the story never states them.

A concept is either a general theme the story is built on, such as motherhood, war or justice, or a story-specific hook that keeps a reader wanting to learn more, such as a stranger stranded under the surface of Mars. Every concept will get a plot of its own that illustrates it.

You are given the concepts the author has chosen, each under its title. Describe every one of them, in the light of the others: in one to three sentences, what it is really about, and in what light the story shows it. A general theme is defined the way an encyclopedia defines the idea, narrowed to how this story uses it. A story-specific hook is described by its role in the story: what it is, what drives it, and why a reader wants to learn more. Describe none as a list of events. Add no concept, and keep every title exactly as it is given.

Write every concept as its title on a line of its own, opened with "### ", followed by its description, and nothing else."""


def _read_concepts(written: str) -> list[tuple[str, str]]:
    """The concepts the model wrote, in order: each one's title and description."""
    _, *blocks = re.split(r"^### ", written, flags=re.MULTILINE)
    concepts: list[tuple[str, str]] = []
    for block in blocks:
        title, _, description = block.partition("\n")
        concept = (title.strip(), description.strip())
        concepts.append(concept)
    return concepts


class DescribeConceptsStep(StageStep):
    """The description of every concept the author chose, each written in the
    light of the others, with the concepts put first in the story. No concept is
    added, and none taken out."""

    def __init__(self, model: CompletingModel) -> None:
        self._model = model

    async def __call__(self, document: Document) -> Document:
        story = InteractiveAuthorStory(document)
        chosen = story.written_concepts()
        request = f"The author's concepts:\n{chosen}"
        messages = [{"role": "system", "content": DESCRIPTION_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)
        concepts_written = written.strip()

        # A concept the model wrote no description for keeps the one it has; a
        # concept the author did not choose is not added.
        read = _read_concepts(concepts_written)
        description_of_title = dict(read)
        described = []
        for concept in document.salient_concepts():
            description = description_of_title.get(concept.title, concept.source)
            concept_described = concept.with_source(description)
            described.append(concept_described)
        others = [cell for cell in document.cells if not isinstance(cell, SalientConceptCell)]
        with_the_concepts_described = document.with_cells([*described, *others])
        return with_the_concepts_described


class ConceptTitles(Stage):
    """The concepts of the author's choosing: the stage does no work of its own,
    and the author adds the concepts at its review, in the Salient Concepts tab."""

    def run(self, document: Document) -> list[StageStep]:
        return []

    def shown(self) -> Shown:
        return ADD_THE_CONCEPTS


class Concepts(Stage):

    def __init__(self, model: CompletingModel) -> None:
        self._model = model

    def run(self, document: Document) -> list[StageStep]:
        describe_step = DescribeConceptsStep(self._model)
        concepts_steps: list[StageStep] = [describe_step]
        return concepts_steps

    def shown(self) -> Shown:
        return TabShown(SALIENT_CONCEPT)
