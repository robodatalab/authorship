import { describe, expect, it } from "vitest";

import { MoveNodeInPlotCommand } from "../../../extension/vscode_runtime/commands/move_node_in_plot";
import {
    PlotEdge,
    PlotNode,
} from "../../../extension/library/storydoc/cells/plot_cell";
import { StoryWordRange } from "../../../extension/library/storydoc/cells/story_word_range";
import { openStory } from "./open_story";

describe("MoveNodeInPlotCommand — moves a node to another place on a plot's trajectory list", () => {
    it.each([
        {
            moving: "a node onto the one below it",
            nodeId: "n1",
            inPlaceOfNodeId: "n2",
            nodesAfter: [
                new PlotNode("n2", new StoryWordRange(6, 7)),
                new PlotNode("n1", new StoryWordRange(2, 3)),
                new PlotNode("n3", new StoryWordRange(0, 0)),
            ],
        },
        {
            moving: "a node onto the one above it",
            nodeId: "n2",
            inPlaceOfNodeId: "n1",
            nodesAfter: [
                new PlotNode("n2", new StoryWordRange(6, 7)),
                new PlotNode("n1", new StoryWordRange(2, 3)),
                new PlotNode("n3", new StoryWordRange(0, 0)),
            ],
        },
        {
            moving: "the first node onto the last",
            nodeId: "n1",
            inPlaceOfNodeId: "n3",
            nodesAfter: [
                new PlotNode("n2", new StoryWordRange(6, 7)),
                new PlotNode("n3", new StoryWordRange(0, 0)),
                new PlotNode("n1", new StoryWordRange(2, 3)),
            ],
        },
        {
            moving: "the last node onto the first",
            nodeId: "n3",
            inPlaceOfNodeId: "n1",
            nodesAfter: [
                new PlotNode("n3", new StoryWordRange(0, 0)),
                new PlotNode("n1", new StoryWordRange(2, 3)),
                new PlotNode("n2", new StoryWordRange(6, 7)),
            ],
        },
        {
            moving: "a node onto itself",
            nodeId: "n2",
            inPlaceOfNodeId: "n2",
            nodesAfter: [
                new PlotNode("n1", new StoryWordRange(2, 3)),
                new PlotNode("n2", new StoryWordRange(6, 7)),
                new PlotNode("n3", new StoryWordRange(0, 0)),
            ],
        },
        {
            moving: "a node the plot no longer holds",
            nodeId: "n4",
            inPlaceOfNodeId: "n1",
            nodesAfter: [
                new PlotNode("n1", new StoryWordRange(2, 3)),
                new PlotNode("n2", new StoryWordRange(6, 7)),
                new PlotNode("n3", new StoryWordRange(0, 0)),
            ],
        },
        {
            moving: "a node onto one the plot no longer holds",
            nodeId: "n1",
            inPlaceOfNodeId: "n4",
            nodesAfter: [
                new PlotNode("n1", new StoryWordRange(2, 3)),
                new PlotNode("n2", new StoryWordRange(6, 7)),
                new PlotNode("n3", new StoryWordRange(0, 0)),
            ],
        },
    ])(
        "orders the nodes when moving $moving",
        ({ nodeId, inPlaceOfNodeId, nodesAfter }) => {
            const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door. He heard the bell.

<!-- cell: plot title="The door" nodes="n1:2-3, n2:6-7, n3:0-0" id="p1" -->

She finds the door.
`);

            new MoveNodeInPlotCommand().invoke(session, {
                annotationCellId: "p1",
                nodeId,
                inPlaceOfNodeId,
            });

            expect(session.document.cellWithId("p1")).toMatchObject({
                nodes: nodesAfter,
            });
        },
    );

    it("keeps the lines between the nodes it moves", () => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door. He heard the bell.

<!-- cell: plot title="The door" nodes="n1:2-3, n2:6-7, n3:0-0" edges="e1:n1>n2, e2:n3>n1" id="p1" -->

She finds the door.
`);

        new MoveNodeInPlotCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "n1",
            inPlaceOfNodeId: "n3",
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            edges: [
                new PlotEdge("e1", "n1", "n2"),
                new PlotEdge("e2", "n3", "n1"),
            ],
        });
    });
});
