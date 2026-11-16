import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock

from authordoc.cells.plot_cell import PlotCell, PlotNode
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from parameterized import parameterized
from server.story_generator.stages.mesh import Mesh, build_round_robin_plot_matrix, matrix_to_connectivity_trajectory


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class PlotMeshingTest(unittest.TestCase):

    def test_matrix_to_unique_tuples(self):
        self.assertSequenceEqual(
            matrix_to_connectivity_trajectory([[0, 1, 2], [1, 2, 0], [2, 0, 1]]),
            [
                set(),
                {(0, 1), (1, 2), (0, 2)},
                {(0, 2), (0, 1), (1, 2)},
            ],
        )

        self.assertSequenceEqual(
            matrix_to_connectivity_trajectory([[1, 2], [3, 1], [2, 3], [1, 0]]),
            [
                {(0, 1), (1, 3)},
                {(0, 2), (2, 3), (0, 3)},
            ],
        )

    @parameterized.expand(
        [
            (
                "two_plots_meet_at_every_step",
                2,
                4,
                [[1, 1, 1, 1], [0, 0, 0, 0]],
                [{(0, 1)}, {(0, 1)}, {(0, 1)}, {(0, 1)}],
            ),
            (
                "one_of_three_plots_sits_out_at_every_step",
                3,
                6,
                [
                    [0, 2, 1, 0, 2, 1],
                    [2, 1, 0, 2, 1, 0],
                    [1, 0, 2, 1, 0, 2],
                ],
                [{(1, 2)}, {(0, 2)}, {(0, 1)}, {(1, 2)}, {(0, 2)}, {(0, 1)}],
            ),
            (
                "four_plots_meet_in_two_pairs_at_every_step",
                4,
                6,
                [
                    [3, 2, 1, 3, 2, 1],
                    [2, 3, 0, 2, 3, 0],
                    [1, 0, 3, 1, 0, 3],
                    [0, 1, 2, 0, 1, 2],
                ],
                [
                    {(0, 3), (1, 2)},
                    {(0, 2), (1, 3)},
                    {(0, 1), (2, 3)},
                    {(0, 3), (1, 2)},
                    {(0, 2), (1, 3)},
                    {(0, 1), (2, 3)},
                ],
            ),
        ]
    )
    def test_round_robin(
        self,
        _,
        n_plots: int,
        traj_len: int,
        expected_matrix: list[list[int]],
        expected_trajectory: list[set[tuple[int, int]]],
    ):
        matrix = build_round_robin_plot_matrix(n_plots, traj_len)
        trajectory = matrix_to_connectivity_trajectory(matrix)

        self.assertSequenceEqual(matrix, expected_matrix)
        self.assertSequenceEqual(trajectory, expected_trajectory)


class MeshRunTest(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        first_plot = PlotCell(
            "plot 1",
            [
                PlotNode("p1e1", None, "1", "earth, house 1", "Plot 1, event 1."),
                PlotNode("p1e2", None, "2", "earth, house 1", "Plot 1, event 2."),
                PlotNode("p1e3", None, "3", "earth, house 1", "Plot 1, event 3."),
                PlotNode("p1e4", None, "4", "earth, house 1", "Plot 1, event 4."),
            ],
            [],
            "",
            False,
            None,
            "plot-1",
        )
        second_plot = PlotCell(
            "plot 2",
            [
                PlotNode("p2e1", None, "1.5", "earth, house 2", "Plot 2, event 1."),
                PlotNode("p2e2", None, "2.5", "earth, house 2", "Plot 2, event 2."),
                PlotNode("p2e3", None, "3.5", "earth, house 2", "Plot 2, event 3."),
                PlotNode("p2e4", None, "4.5", "earth, house 2", "Plot 2, event 4."),
            ],
            [],
            "",
            False,
            None,
            "plot-2",
        )
        self.document = Document.from_cells([first_plot, second_plot])
        model = Mock()
        model.complete.side_effect = [
            streamed("intersection location | intersection"),
            streamed("intersection location | intersection"),
            streamed("intersection location | intersection"),
            streamed("intersection location | intersection"),
        ]
        self.mesh = Mesh(model)

    async def test_meshing_rewrites_the_events_that_meet(self):
        first_step, second_step, third_step, fourth_step = self.mesh.run(self.document)

        first_document = await first_step(self.document)
        second_document = await second_step(first_document)
        third_document = await third_step(second_document)
        fourth_document = await fourth_step(third_document)

        meshed_first, meshed_second = fourth_document.plots()
        self.assertSequenceEqual(
            meshed_first.nodes,
            [
                PlotNode("p1e1", None, "1", "intersection location", "intersection"),
                PlotNode("p1e2", None, "2", "intersection location", "intersection"),
                PlotNode("p1e3", None, "3", "intersection location", "intersection"),
                PlotNode("p1e4", None, "4", "intersection location", "intersection"),
            ],
        )
        self.assertSequenceEqual(
            meshed_second.nodes,
            [
                PlotNode("p2e1", None, "1", "intersection location", "intersection"),
                PlotNode("p2e2", None, "2", "intersection location", "intersection"),
                PlotNode("p2e3", None, "3", "intersection location", "intersection"),
                PlotNode("p2e4", None, "4", "intersection location", "intersection"),
            ],
        )
