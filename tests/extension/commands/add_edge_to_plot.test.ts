import { describe, expect, it, vi } from "vitest";

import { AddEdgeToPlotCommand } from "../../../extension/vscode_runtime/commands/add_edge_to_plot";
import { PlotEdge } from "authordoc/cells/plot_cell";
import { openStory } from "./open_story";

describe("AddEdgeToPlotCommand — connects two nodes of a plot's trajectory", () => {
    it("adds a line from the node it starts at to the node it reaches", () => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door. He heard the bell.

<!-- cell: plot title="The door" nodes="n1:2-3, n2:6-7" id="p1" -->

She finds the door.
`);
        vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
            "3f1c0e2a-0000-4000-8000-000000000001",
        );

        new AddEdgeToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            fromNodeId: "n2",
            toNodeId: "n1",
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            edges: [
                new PlotEdge("3f1c0e2a-0000-4000-8000-000000000001", "n2", "n1"),
            ],
        });
    });

    it("adds nothing when the nodes are connected already", () => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door. He heard the bell.

<!-- cell: plot title="The door" nodes="n1:2-3, n2:6-7" edges="e1:n1>n2" id="p1" -->

She finds the door.
`);

        new AddEdgeToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            fromNodeId: "n1",
            toNodeId: "n2",
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            edges: [new PlotEdge("e1", "n1", "n2")],
        });
    });

    it.each([
        { reaching: "a node the plot no longer holds", toNodeId: "n3" },
        { reaching: "the node it starts at", toNodeId: "n1" },
    ])("adds nothing when the line would reach $reaching", ({ toNodeId }) => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door. He heard the bell.

<!-- cell: plot title="The door" nodes="n1:2-3, n2:6-7" id="p1" -->

She finds the door.
`);

        new AddEdgeToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            fromNodeId: "n1",
            toNodeId,
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            edges: [],
        });
    });
});
