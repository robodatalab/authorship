import unittest

from authordoc.cells.plot_cell import PlotCell, PlotEdge, PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from server.story_generator.stages.validity import PlotValidityStep, SceneCountsStep


class PlotValidityStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_reports_a_plot_that_can_be_followed_from_start_to_finish(self) -> None:
        motherhood = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        plot = PlotCell(
            "Motherhood",
            [
                PlotNode("e1", None, "1", "b1", [], "Varn waits."),
                PlotNode("e2", None, "2", "b1", [], "Varn gives birth."),
            ],
            [PlotEdge("x1", "e1", "e2")],
            "",
            False,
            None,
            "p1",
        )
        plot_of_motherhood = plot.with_concepts([motherhood])
        document = Document.from_cells([motherhood, plot_of_motherhood])

        with self.assertLogs("server.story_generator.stages.validity", level="INFO") as logged:
            await PlotValidityStep(0)(document)

        self.assertEqual(
            logged.output,
            [
                "INFO:server.story_generator.stages.validity:Motherhood, 2 events: can be followed from start to finish",
                "INFO:server.story_generator.stages.validity:  always option 1 - plot end achieved 100%, longest consistent plot trajectory: 2 events 100%",
            ],
        )

    async def test_reports_where_a_plot_breaks_and_the_events_of_its_concept_not_shown(self) -> None:
        motherhood = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        plot = PlotCell(
            "Motherhood",
            [
                PlotNode("e1", None, "1", "b1", [], "Varn waits."),
                PlotNode("e2", None, "2", "b1", [], "Varn gives birth."),
                PlotNode("e3", None, "3", "b1", [], "Varn names her son."),
            ],
            [PlotEdge("x1", "e1", "e2")],
            "",
            False,
            None,
            "p1",
        )
        plot_of_motherhood = plot.with_concepts([motherhood])
        document = Document.from_cells([motherhood, plot_of_motherhood])

        with self.assertLogs("server.story_generator.stages.validity", level="INFO") as logged:
            await PlotValidityStep(0)(document)

        self.assertEqual(
            logged.output,
            [
                "INFO:server.story_generator.stages.validity:Motherhood, 3 events: breaks at \"Varn gives birth.\": the play ends here, shown 2 of the plot's 3 events in a row",
                "INFO:server.story_generator.stages.validity:  Motherhood: 1 of its 3 events not shown",
                "INFO:server.story_generator.stages.validity:    \"Varn names her son.\"",
                "INFO:server.story_generator.stages.validity:  always option 1 - plot end achieved 0%, longest consistent plot trajectory: 2 events 100%",
            ],
        )


class SceneCountsStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_counts_the_scenes_where_plots_meet_and_those_with_one_transition(self) -> None:
        varn = PlotCell(
            "Motherhood",
            [
                PlotNode("e1", None, "1", "b1", [], "Dax takes the water from Varn and her son."),
                PlotNode("e2", None, "2", "r1", [], "Varn shares her water with her son."),
                PlotNode("e3", None, "3", "r1", [], "Varn's son falls asleep."),
            ],
            [PlotEdge("x1", "e1", "e2"), PlotEdge("x2", "e2", "e3")],
            "",
            False,
            None,
            "p1",
        )
        dax = PlotCell(
            "Brutal father",
            [
                PlotNode("f1", None, "1", "b1", [], "Dax takes the water from Varn and her son."),
                PlotNode("f2", None, "2.5", "b1", [], "Dax drinks in front of the thirsty."),
            ],
            [PlotEdge("x3", "f1", "f2")],
            "",
            False,
            None,
            "p2",
        )
        document = Document.from_cells([varn, dax])

        with self.assertLogs("server.story_generator.stages.validity", level="INFO") as logged:
            await SceneCountsStep()(document)

        self.assertEqual(
            logged.output,
            ["INFO:server.story_generator.stages.validity:scenes: 4; intersections, where plots meet: 1; scenes with only 1 choice: 1"],
        )
