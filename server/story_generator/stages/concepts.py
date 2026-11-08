"""The story's salient concepts: what the story is about, kept as its salient
concept cells, first in the story. The author is asked for the concepts of
their choosing; then the model describes every one of them, in the light of the
others, as what it is really about and in what light the story shows it. The
model adds no concept: the story is about what the author chose. The author
reviews the descriptions together.

A concept is an idea, not a thing that appears in the story: a general theme the
story is built on, such as motherhood or war, or a story-specific hook, such as
a stranger stranded under the surface of Mars. Every concept gets a plot of its
own, and every plot respects every concept.

The model writes, and the author reviews, every concept as its title on a line
of its own, opened with "### ", followed by its description:

    ### Motherhood
    A mother's care for her child, shown in the light of what it costs her.
"""

from __future__ import annotations

import re
from uuid import uuid4

from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from cortexgrid_infer import CompletingModel
from server.story_generator.review import ReviewResult, TerminalReview
from server.story_generator.stage import Stage, StageStep

QUESTION = "Which concepts should the story be about? One a line, an empty line to finish."

DESCRIPTION_INSTRUCTIONS = """You help an author describe what an interactive story is about: its salient concepts, the ideas a reader should come away understanding, though the story never states them.

A concept is either a general theme the story is built on, such as motherhood, war or justice, or a story-specific hook that keeps a reader wanting to learn more, such as a stranger stranded under the surface of Mars. Every concept will get a plot of its own that illustrates it.

You are given the concepts the author has chosen, each under its title. Describe every one of them, in the light of the others: in one to three sentences, what it is really about, and in what light the story shows it. A general theme is defined the way an encyclopedia defines the idea, narrowed to how this story uses it. A story-specific hook is described by its role in the story: what it is, what drives it, and why a reader wants to learn more. Describe none as a list of events. Add no concept, and keep every title exactly as it is given.

When you are also given the author's comment on the descriptions you wrote before, answer it.

Write every concept as its title on a line of its own, opened with "### ", followed by its description, and nothing else."""

# Room for the titles and the descriptions of a story's concepts.
MAX_CONCEPTS_TOKENS = 1500


def _read_titles(typed: str) -> list[str]:
    """The titles the author typed, in order, each once."""
    titles: list[str] = []
    for line in typed.splitlines():
        unmarked = line.strip().lstrip("-*• ")
        title = unmarked.strip()
        if title and title not in titles:
            titles.append(title)
    return titles


def _read_concepts(written: str) -> list[tuple[str, str]]:
    """The concepts the model wrote, in order: each one's title and description."""
    _, *blocks = re.split(r"^### ", written, flags=re.MULTILINE)
    concepts: list[tuple[str, str]] = []
    for block in blocks:
        title, _, description = block.partition("\n")
        concept = (title.strip(), description.strip())
        concepts.append(concept)
    return concepts


class AskForConceptsStep(StageStep):
    """The concepts of the author's choosing, asked for first and added to the
    story's concepts, with no description yet."""

    async def __call__(self, document: Document, reviews: TerminalReview, reviewer_instruction: str) -> tuple[ReviewResult, Document]:
        typed = reviews.ask(QUESTION)
        titles = _read_titles(typed)
        held = document.salient_concepts()
        held_titles = [concept.title for concept in held]

        chosen = []
        for title in titles:
            if title in held_titles:
                continue
            concept = SalientConceptCell(title=title, references=[], source="", _unique_id=str(uuid4()))
            chosen.append(concept)

        others = [cell for cell in document.cells if not isinstance(cell, SalientConceptCell)]
        document = document.with_cells([*held, *chosen, *others])
        review_result = ReviewResult.success()
        return review_result, document


class DescribeConceptsStep(StageStep):
    """The description of every concept the author chose, each written in the
    light of the others. No concept is added, and none taken out."""

    def __init__(self, model: CompletingModel) -> None:
        self._model = model

    async def __call__(self, document: Document, reviews: TerminalReview, reviewer_instruction: str) -> tuple[ReviewResult, Document]:
        story = InteractiveAuthorStory(document)
        chosen = story.written_concepts()
        asked = f"\n\nThe author asks you to do it again: {reviewer_instruction}" if reviewer_instruction else ""
        request = f"The author's concepts:\n{chosen}{asked}"
        messages = [{"role": "system", "content": DESCRIPTION_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages, max_new_tokens=MAX_CONCEPTS_TOKENS)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)
        concepts_written = written.strip()

        review_result = reviews(concepts_written)
        if not review_result.is_passed():
            return review_result, document

        # A concept the model wrote no description for keeps the one it has; a
        # concept the author did not choose is not added.
        read = _read_concepts(concepts_written)
        description_of_title = dict(read)
        for concept in document.salient_concepts():
            description = description_of_title.get(concept.title, concept.source)
            described = concept.with_source(description)
            document = document.with_cell(described)
        return review_result, document


class Concepts(Stage):

    def __init__(self, model: CompletingModel) -> None:
        self._model = model

    def run(self, document: Document) -> list[StageStep]:
        ask_step = AskForConceptsStep()
        describe_step = DescribeConceptsStep(self._model)
        concepts_steps: list[StageStep] = [ask_step, describe_step]
        return concepts_steps
