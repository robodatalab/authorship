import { describe, expect, it, vi, type Mock } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { PlotEdge } from "authordoc/cells/plot_cell";
import { AuthorFileEditorPlotTrajectoryLanes } from "../../../extension/webview/cell_types/AuthorFileEditorPlotTrajectoryLanes";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("the lanes drawn beside a plot's trajectory", () => {
    let onNodeClicked: Mock;
    let onConnected: Mock;
    let onDisconnected: Mock;

    async function mountTheLanes(
        nodeIds: string[],
        edges: PlotEdge[],
        heightOfEachRow: number[],
    ): Promise<void> {
        onNodeClicked = vi.fn();
        onConnected = vi.fn();
        onDisconnected = vi.fn();
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(
                <AuthorFileEditorPlotTrajectoryLanes
                    nodeIds={nodeIds}
                    edges={edges}
                    heightOfEachRow={heightOfEachRow}
                    nodeIdSelected={null}
                    nodeIdDragged={null}
                    onNodeClicked={onNodeClicked}
                    onConnected={onConnected}
                    onDisconnected={onDisconnected}
                />,
            );
        });
    }

    async function dispatch(element: Element, eventType: string): Promise<void> {
        const event = new MouseEvent(eventType, { bubbles: true });
        await act(async () => {
            element.dispatchEvent(event);
        });
    }

    it("draws each node in the middle of its row, however tall the rows above it", async () => {
        await mountTheLanes(["n1", "n2", "n3"], [], [100, 50, 20]);

        const nodesDrawnAt = [
            ...document.querySelectorAll(
                ".author-file-editor-plot-trajectory-node",
            ),
        ].map((node) => node.getAttribute("cy"));
        expect(nodesDrawnAt).toEqual(["50", "125", "160"]);
    });

    it.each([
        {
            edge: "to a node in a later row",
            edges: [new PlotEdge("e1", "n1", "n2")],
            arrowhead: "M 3.5 19.5 L 10.5 19.5 L 7 24.5 Z",
        },
        {
            edge: "back to a node in an earlier row",
            edges: [new PlotEdge("e1", "n2", "n1")],
            arrowhead: "M 3.5 24.5 L 10.5 24.5 L 7 19.5 Z",
        },
    ])(
        "points the line of an edge $edge at the node it reaches",
        async ({ edges, arrowhead }) => {
            await mountTheLanes(["n1", "n2"], edges, [22, 22]);

            const arrowheadDrawn = document
                .querySelector(".author-file-editor-plot-trajectory-edge-arrowhead")
                ?.getAttribute("d");
            expect(arrowheadDrawn).toBe(arrowhead);
        },
    );

    it("asks for the node clicked", async () => {
        await mountTheLanes(["n1", "n2"], [], [22, 22]);
        const secondNode = document.querySelectorAll(
            ".author-file-editor-plot-trajectory-node",
        )[1];

        await dispatch(secondNode, "click");

        expect(onNodeClicked.mock.calls).toEqual([["n2"]]);
    });

    it.each([
        { letGoOn: "its row", target: ".author-file-editor-plot-trajectory-row-let-go-on" },
        { letGoOn: "its node", target: ".author-file-editor-plot-trajectory-node" },
    ])(
        "asks for the node pressed to be connected to the node let go on $letGoOn",
        async ({ target }) => {
            await mountTheLanes(["n1", "n2"], [], [22, 22]);
            const secondNode = document.querySelectorAll(
                ".author-file-editor-plot-trajectory-node",
            )[1];

            await dispatch(secondNode, "mousedown");
            const firstTarget = document.querySelectorAll(target)[0];
            await dispatch(firstTarget, "mouseup");

            expect(onConnected.mock.calls).toEqual([["n2", "n1"]]);
        },
    );

    it("connects nothing when let go on the node it was pressed on", async () => {
        await mountTheLanes(["n1", "n2"], [], [22, 22]);
        const firstNode = document.querySelectorAll(
            ".author-file-editor-plot-trajectory-node",
        )[0];

        await dispatch(firstNode, "mousedown");
        await dispatch(firstNode, "mouseup");

        expect(onConnected).not.toHaveBeenCalled();
    });

    it("connects nothing once let go outside the lanes", async () => {
        await mountTheLanes(["n1", "n2"], [], [22, 22]);
        const nodes = document.querySelectorAll(
            ".author-file-editor-plot-trajectory-node",
        );

        await dispatch(nodes[0], "mousedown");
        await dispatch(document.body, "mouseup");
        await dispatch(nodes[1], "mouseup");

        expect(onConnected).not.toHaveBeenCalled();
    });

    it("asks for the nodes whose line is clicked to be disconnected", async () => {
        await mountTheLanes(
            ["n1", "n2"],
            [new PlotEdge("e1", "n1", "n2")],
            [22, 22],
        );
        const edge = document.querySelector(
            ".author-file-editor-plot-trajectory-edge",
        )!;

        await dispatch(edge, "click");

        expect(onDisconnected.mock.calls).toEqual([["e1"]]);
    });
});
