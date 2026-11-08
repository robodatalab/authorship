import unittest

from authordoc.cells.plot_cell import PlotCell, PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from parameterized import parameterized
from server.story_generator.exposure_tracker import ExposureTracker


class ExposureTrackerGetExposure(unittest.TestCase):
    def setUp(self) -> None:
        self.motherhood = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        self.war = SalientConceptCell("War", [], "A war.", False, None, "k2")
        varn_begun = PlotCell(
            "Motherhood",
            [
                PlotNode("e1", None, "1", "mars, the base", "Dax takes the water from Varn and her son."),
                PlotNode("e2", None, "2", "mars, Varn's room", "Varn shares her water with her son."),
                PlotNode("e3", None, "3", "mars, the base", "Varn leaves the base with her son."),
                PlotNode("e4", None, "4", "mars, the dunes", "Varn and her son find a spring."),
            ],
            [],
            "",
            False,
            None,
            "p1",
        )
        varn = varn_begun.with_concepts([self.motherhood])
        self.document = Document.from_cells([self.motherhood, self.war, varn])

    @parameterized.expand(
        [
            ("nothing_seen", [], 0.0),
            (
                "one_of_its_plots_four_events_seen",
                [PlotNode("e1", None, "1", "mars, the base", "Dax takes the water from Varn and her son.")],
                0.25,
            ),
            (
                "every_event_of_its_plot_seen",
                [
                    PlotNode("e1", None, "1", "mars, the base", "Dax takes the water from Varn and her son."),
                    PlotNode("e2", None, "2", "mars, Varn's room", "Varn shares her water with her son."),
                    PlotNode("e3", None, "3", "mars, the base", "Varn leaves the base with her son."),
                    PlotNode("e4", None, "4", "mars, the dunes", "Varn and her son find a spring."),
                ],
                1.0,
            ),
        ]
    )
    def test_is_the_share_of_the_events_of_the_concepts_plots_seen(self, _, seen: list[PlotNode], expected_exposure: float) -> None:
        tracker = ExposureTracker(self.document)
        tracker.see(seen)

        exposure = tracker.get_exposure(self.motherhood)

        self.assertEqual(exposure, expected_exposure)

    def test_is_nothing_for_a_concept_no_plot_shows(self) -> None:
        tracker = ExposureTracker(self.document)
        tracker.see([PlotNode("e1", None, "1", "mars, the base", "Dax takes the water from Varn and her son.")])

        exposure = tracker.get_exposure(self.war)

        self.assertEqual(exposure, 0.0)
