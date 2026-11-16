"""How a play followed a plot.

A plot is a sequence of events in causal order. A trajectory is a run of the
plot's events the play saw, each the very next event after the one before it:
the event the plot's edge from it leads to. Seeing one of the plot's events that
is not the very next one, whether it skips events or steps back, ends the
trajectory and starts another at that event. Seeing other plots' events in
between ends nothing.
"""

from __future__ import annotations

from collections.abc import Sequence

from authordoc.cells.plot_cell import PlotCell, PlotNode


def get_trajectories(plot: PlotCell, exposure: Sequence[PlotNode]) -> list[list[PlotNode]]:
    """Every trajectory along which the play followed the plot, in the order it
    followed them."""
    event_ids = {event.node_id for event in plot.nodes}
    next_event_ids = {edge.from_node_id: edge.to_node_id for edge in plot.edges}
    trajectories: list[list[PlotNode]] = []
    for event in exposure:
        if event.node_id not in event_ids:
            continue
        if trajectories:
            trajectory = trajectories[-1]
            last = trajectory[-1]
            next_event_id = next_event_ids.get(last.node_id)
            if event.node_id == next_event_id:
                trajectory.append(event)
                continue
        trajectories.append([event])
    return trajectories
