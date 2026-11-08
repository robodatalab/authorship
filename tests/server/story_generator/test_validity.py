import random
import unittest

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.plot_cell import PlotCell, PlotEdge, PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.cells.story_word_range import StoryWordRange
from authordoc.storydoc import Document
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.review import TerminalReview
from server.story_generator.stages.validity import PlotValidityStep


class PlotValidityStepCall(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        # The story's words: "Varn(0) waited.(1)", where the plot starts, then
        # "Varn(2) gave(3) birth.(4)", where it ends.
        motherhood = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        plot_begun = PlotCell(
            "Motherhood",
            [
                PlotNode("e1", StoryWordRange(0, 1), "1", "mars, the base", "Varn waits."),
                PlotNode("e2", StoryWordRange(2, 4), "2", "mars, the base", "Varn gives birth."),
            ],
            [PlotEdge("x1", "e1", "e2")],
            "",
            False,
            None,
            "p1",
        )
        plot = plot_begun.with_concepts([motherhood])
        self.document = Document.from_cells(
            [
                motherhood,
                plot,
                MarkdownCell("Varn waited.", False, None, "s1"),
                MarkdownCell("Varn gave birth.", False, None, "s2"),
            ]
        )
        chance = random.Random(0)
        self.reviews = TerminalReview(0.0, chance)

    async def test_reports_a_plot_that_can_be_followed_from_start_to_finish(self) -> None:
        story = InteractiveAuthorStory(self.document)
        waiting, _ = story.scenes
        with_the_choice = story.with_scenes([waiting.with_options({"x1": "Varn went on."})])

        with self.assertLogs("server.story_generator.stages.validity", level="INFO") as logged:
            await PlotValidityStep(0)(with_the_choice.document, self.reviews, "")

        self.assertEqual(
            logged.output,
            [
                "INFO:server.story_generator.stages.validity:Motherhood, 2 events: can be followed from start to finish",
                "INFO:server.story_generator.stages.validity:  always option 1 - plot end achieved 100%, longest consistent plot trajectory: 2 events 100%",
            ],
        )

    async def test_reports_where_a_plot_breaks_and_the_events_of_its_concept_not_shown(self) -> None:
        with self.assertLogs("server.story_generator.stages.validity", level="INFO") as logged:
            await PlotValidityStep(0)(self.document, self.reviews, "")

        self.assertEqual(
            logged.output,
            [
                "INFO:server.story_generator.stages.validity:Motherhood, 2 events: breaks at \"Varn waits.\": the player fails to show its scene (KeyError: 'x1')",
                "INFO:server.story_generator.stages.validity:  Motherhood: 1 of its 2 events not shown",
                "INFO:server.story_generator.stages.validity:    \"Varn gives birth.\"",
            ],
        )
