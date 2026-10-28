import { describe, expect, it } from "vitest";

import { PlotEdge } from "authordoc/cells/plot_cell";
import {
    PlotEdgeInALane,
    PlotTrajectoryLanes,
} from "../../../extension/webview/panel/PlotTrajectoryLanes";

describe("the lanes of a plot's trajectory", () => {
    it.each([
        {
            trajectory: "without nodes",
            nodeIds: [],
            edges: [],
            laneOfEachNode: [],
            edgesInLanes: [],
            lanesTaken: 0,
        },
        {
            trajectory: "of nodes nothing connects",
            nodeIds: ["a", "b", "c"],
            edges: [],
            laneOfEachNode: [0, 0, 0],
            edgesInLanes: [],
            lanesTaken: 1,
        },
        {
            trajectory: "of one chain",
            nodeIds: ["a", "b", "c"],
            edges: [new PlotEdge("ab", "a", "b"), new PlotEdge("bc", "b", "c")],
            laneOfEachNode: [0, 0, 0],
            edgesInLanes: [
                new PlotEdgeInALane("ab", 0, 1, 0),
                new PlotEdgeInALane("bc", 1, 2, 0),
            ],
            lanesTaken: 1,
        },
        {
            trajectory: "of a chain that skips a node",
            nodeIds: ["a", "b", "c"],
            edges: [new PlotEdge("ac", "a", "c")],
            laneOfEachNode: [0, 1, 0],
            edgesInLanes: [new PlotEdgeInALane("ac", 0, 2, 0)],
            lanesTaken: 2,
        },
        {
            trajectory: "that forks",
            nodeIds: ["a", "b", "c"],
            edges: [new PlotEdge("ac", "a", "c"), new PlotEdge("ab", "a", "b")],
            laneOfEachNode: [0, 0, 1],
            edgesInLanes: [
                new PlotEdgeInALane("ac", 0, 2, 1),
                new PlotEdgeInALane("ab", 0, 1, 0),
            ],
            lanesTaken: 2,
        },
        {
            trajectory: "that joins",
            nodeIds: ["a", "b", "c"],
            edges: [new PlotEdge("ac", "a", "c"), new PlotEdge("bc", "b", "c")],
            laneOfEachNode: [0, 1, 0],
            edgesInLanes: [
                new PlotEdgeInALane("ac", 0, 2, 0),
                new PlotEdgeInALane("bc", 1, 2, 1),
            ],
            lanesTaken: 2,
        },
        {
            trajectory: "that forks and joins again",
            nodeIds: ["a", "b", "c", "d"],
            edges: [
                new PlotEdge("ab", "a", "b"),
                new PlotEdge("ac", "a", "c"),
                new PlotEdge("bd", "b", "d"),
                new PlotEdge("cd", "c", "d"),
            ],
            laneOfEachNode: [0, 0, 1, 0],
            edgesInLanes: [
                new PlotEdgeInALane("ab", 0, 1, 0),
                new PlotEdgeInALane("ac", 0, 2, 1),
                new PlotEdgeInALane("bd", 1, 3, 0),
                new PlotEdgeInALane("cd", 2, 3, 1),
            ],
            lanesTaken: 2,
        },
        {
            trajectory: "that leads back to a node written earlier",
            nodeIds: ["a", "b", "c"],
            edges: [new PlotEdge("ca", "c", "a")],
            laneOfEachNode: [0, 1, 0],
            edgesInLanes: [new PlotEdgeInALane("ca", 2, 0, 0)],
            lanesTaken: 2,
        },
        {
            trajectory: "of two chains running side by side",
            nodeIds: ["a", "b", "c", "d"],
            edges: [new PlotEdge("ac", "a", "c"), new PlotEdge("bd", "b", "d")],
            laneOfEachNode: [0, 1, 0, 1],
            edgesInLanes: [
                new PlotEdgeInALane("ac", 0, 2, 0),
                new PlotEdgeInALane("bd", 1, 3, 1),
            ],
            lanesTaken: 2,
        },
        {
            trajectory: "with an edge from a node to itself",
            nodeIds: ["a", "b"],
            edges: [new PlotEdge("aa", "a", "a"), new PlotEdge("ab", "a", "b")],
            laneOfEachNode: [0, 0],
            edgesInLanes: [new PlotEdgeInALane("ab", 0, 1, 0)],
            lanesTaken: 1,
        },
        {
            trajectory: "with an edge to a node that is not in it",
            nodeIds: ["a", "b"],
            edges: [new PlotEdge("ax", "a", "x"), new PlotEdge("ab", "a", "b")],
            laneOfEachNode: [0, 0],
            edgesInLanes: [new PlotEdgeInALane("ab", 0, 1, 0)],
            lanesTaken: 1,
        },
    ])(
        "lays out a trajectory $trajectory",
        ({ nodeIds, edges, laneOfEachNode, edgesInLanes, lanesTaken }) => {
            const lanes = new PlotTrajectoryLanes(nodeIds, edges);

            expect(lanes.laneOfEachNode).toEqual(laneOfEachNode);
            expect(lanes.edgesInLanes).toEqual(edgesInLanes);
            expect(lanes.lanesTaken).toBe(lanesTaken);
        },
    );
});
