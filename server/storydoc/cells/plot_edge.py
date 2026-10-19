from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlotEdge:
    edge_id: str
    from_node_id: str
    to_node_id: str
