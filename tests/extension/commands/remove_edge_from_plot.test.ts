import { describe, expect, it } from "vitest";

import { RemoveEdgeFromPlotCommand } from "../../../extension/vscode_runtime/commands/remove_edge_from_plot";
import { PlotEdge } from "../../../extension/library/storydoc/cells/plot_cell";
import { openStory } from "./open_story";

describe("RemoveEdgeFromPlotCommand — disconnects two nodes of a plot's trajectory", () => {
    it("removes the line it was asked to and keeps the others", () => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door. He heard the bell.

<!-- cell: plot title="The door" nodes="n1:2-3, n2:6-7, n3:0-0" edges="e1:n1>n2, e2:n3>n1" id="p1" -->

She finds the door.
`);

        new RemoveEdgeFromPlotCommand().invoke(session, {
            annotationCellId: "p1",
            edgeId: "e1",
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            edges: [new PlotEdge("e2", "n3", "n1")],
        });
    });
});
