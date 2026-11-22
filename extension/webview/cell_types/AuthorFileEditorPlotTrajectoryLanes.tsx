import {
    useEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
} from "react";
import type { PlotEdge } from "authordoc/cells/plot_cell";
import {
    PlotTrajectoryLanes,
    type PlotEdgeInALane,
} from "./PlotTrajectoryLanes";
import "./StoryAnnotationCells.css";

const DISCONNECT_THE_NODES = "Disconnect these nodes";
const TRAJECTORY_LANE_WIDTH = 14;
const TRAJECTORY_NODE_RADIUS = 4;
const TRAJECTORY_ARROWHEAD_HALF_WIDTH = 3.5;
const TRAJECTORY_ARROWHEAD_HALF_LENGTH = 2.5;
const TRAJECTORY_LANE_COLORS = 6;

interface AuthorFileEditorPlotTrajectoryLanesProps {
    nodeIds: readonly string[];
    edges: readonly PlotEdge[];
    heightOfEachRow: readonly number[];
    nodeIdSelected: string | null;
    nodeIdDragged: string | null;
    onNodeClicked: (nodeId: string) => void;
    onConnected: (fromNodeId: string, toNodeId: string) => void;
    onDisconnected: (edgeId: string) => void;
}

export function AuthorFileEditorPlotTrajectoryLanes({
    nodeIds,
    edges,
    heightOfEachRow,
    nodeIdSelected,
    nodeIdDragged,
    onNodeClicked,
    onConnected,
    onDisconnected,
}: AuthorFileEditorPlotTrajectoryLanesProps) {
    const lanesDrawn = useRef<SVGSVGElement>(null);
    const [rowConnectedFrom, connectFromRow] = useState<number | null>(null);
    const [pointerAt, movePointerTo] = useState<[number, number] | null>(
        null,
    );
    const lanes = new PlotTrajectoryLanes(nodeIds, edges);
    const lanesWidth = lanes.lanesTaken * TRAJECTORY_LANE_WIDTH;
    const topOfEachRow = topsOfTheRows(heightOfEachRow);
    const middleOfEachRow = topOfEachRow.map(
        (top, row) => top + heightOfEachRow[row] / 2,
    );
    const rowsHeight = heightOfEachRow.reduce(
        (heightSoFar, height) => heightSoFar + height,
        0,
    );
    const xConnectedFrom =
        rowConnectedFrom === null
            ? null
            : xOfTheLane(lanes.laneOfEachNode[rowConnectedFrom]);
    const yConnectedFrom =
        rowConnectedFrom === null ? null : middleOfEachRow[rowConnectedFrom];

    useEffect(() => {
        if (rowConnectedFrom === null) {
            return;
        }
        function stopConnecting(): void {
            connectFromRow(null);
            movePointerTo(null);
        }
        window.addEventListener("mouseup", stopConnecting);
        return () => window.removeEventListener("mouseup", stopConnecting);
    }, [rowConnectedFrom]);

    function connectTo(row: number): void {
        if (rowConnectedFrom === null || rowConnectedFrom === row) {
            return;
        }
        onConnected(nodeIds[rowConnectedFrom], nodeIds[row]);
    }

    function followThePointer(event: ReactMouseEvent): void {
        if (rowConnectedFrom === null || lanesDrawn.current === null) {
            return;
        }
        const lanesBox = lanesDrawn.current.getBoundingClientRect();
        movePointerTo([
            event.clientX - lanesBox.left,
            event.clientY - lanesBox.top,
        ]);
    }

    return (
        <>
            <div
                className="author-file-editor-plot-trajectory-lanes-gutter"
                style={{ width: lanesWidth }}
            />
            <svg
                ref={lanesDrawn}
                className="author-file-editor-plot-trajectory-lanes"
                width="100%"
                height={rowsHeight}
                onMouseMove={followThePointer}
            >
                {rowConnectedFrom !== null &&
                    nodeIds.map((nodeId, row) => (
                        <rect
                            key={nodeId}
                            className="author-file-editor-plot-trajectory-row-let-go-on"
                            x={0}
                            y={topOfEachRow[row]}
                            width="100%"
                            height={heightOfEachRow[row]}
                            onMouseUp={() => connectTo(row)}
                        />
                    ))}
                {lanes.edgesInLanes.map((edge) => {
                    const edgeDrawn = pathOfTheEdge(
                        edge,
                        lanes.laneOfEachNode,
                        middleOfEachRow,
                        heightOfEachRow,
                    );
                    const arrowheadDrawn = arrowheadOfTheEdge(
                        edge,
                        middleOfEachRow,
                    );
                    return (
                        <g
                            key={edge.edgeId}
                            className={`author-file-editor-plot-trajectory-edge author-file-editor-plot-trajectory-lane-${edge.lane % TRAJECTORY_LANE_COLORS}`}
                            role="button"
                            aria-label={DISCONNECT_THE_NODES}
                            onClick={() => onDisconnected(edge.edgeId)}
                        >
                            <title>{DISCONNECT_THE_NODES}</title>
                            <path
                                className="author-file-editor-plot-trajectory-edge-line"
                                d={edgeDrawn}
                            />
                            <path
                                className="author-file-editor-plot-trajectory-edge-arrowhead"
                                d={arrowheadDrawn}
                            />
                            <path
                                className="author-file-editor-plot-trajectory-edge-grip"
                                d={edgeDrawn}
                            />
                        </g>
                    );
                })}
                {lanes.laneOfEachNode.map((lane, node) => {
                    const xOfTheNode = xOfTheLane(lane);
                    const yOfTheNode = middleOfEachRow[node];
                    return (
                        <circle
                            key={nodeIds[node]}
                            className={`author-file-editor-plot-trajectory-node${
                                nodeIds[node] === nodeIdSelected
                                    ? " author-file-editor-plot-trajectory-node-selected"
                                    : ""
                            }${
                                nodeIds[node] === nodeIdDragged
                                    ? " author-file-editor-plot-trajectory-node-dragged"
                                    : ""
                            } author-file-editor-plot-trajectory-lane-${lane % TRAJECTORY_LANE_COLORS}`}
                            cx={xOfTheNode}
                            cy={yOfTheNode}
                            r={TRAJECTORY_NODE_RADIUS}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                connectFromRow(node);
                            }}
                            onMouseUp={() => connectTo(node)}
                            onClick={() => onNodeClicked(nodeIds[node])}
                        />
                    );
                })}
                {xConnectedFrom !== null &&
                    yConnectedFrom !== null &&
                    pointerAt !== null && (
                        <line
                            className="author-file-editor-plot-trajectory-connection"
                            x1={xConnectedFrom}
                            y1={yConnectedFrom}
                            x2={pointerAt[0]}
                            y2={pointerAt[1]}
                        />
                    )}
            </svg>
        </>
    );
}

function xOfTheLane(lane: number): number {
    return (lane + 0.5) * TRAJECTORY_LANE_WIDTH;
}

function topsOfTheRows(heightOfEachRow: readonly number[]): number[] {
    const topOfEachRow: number[] = [];
    let top = 0;
    for (const height of heightOfEachRow) {
        topOfEachRow.push(top);
        top += height;
    }
    return topOfEachRow;
}

function pathOfTheEdge(
    edge: PlotEdgeInALane,
    laneOfEachNode: readonly number[],
    middleOfEachRow: readonly number[],
    heightOfEachRow: readonly number[],
): string {
    const topRow = Math.min(edge.fromRow, edge.toRow);
    const bottomRow = Math.max(edge.fromRow, edge.toRow);
    const xOfTheTopNode = xOfTheLane(laneOfEachNode[topRow]);
    const xOfTheBottomNode = xOfTheLane(laneOfEachNode[bottomRow]);
    const xOfTheEdge = xOfTheLane(edge.lane);
    const yOfTheTopNode = middleOfEachRow[topRow];
    const yOfTheBottomNode = middleOfEachRow[bottomRow];
    const halfTheTopRow = heightOfEachRow[topRow] / 2;
    const halfTheBottomRow = heightOfEachRow[bottomRow] / 2;
    const edgeDrawn = [
        `M ${xOfTheTopNode} ${yOfTheTopNode}`,
        `Q ${xOfTheEdge} ${yOfTheTopNode} ${xOfTheEdge} ${yOfTheTopNode + halfTheTopRow}`,
        `L ${xOfTheEdge} ${yOfTheBottomNode - halfTheBottomRow}`,
        `Q ${xOfTheEdge} ${yOfTheBottomNode} ${xOfTheBottomNode} ${yOfTheBottomNode}`,
    ].join(" ");
    return edgeDrawn;
}

function arrowheadOfTheEdge(
    edge: PlotEdgeInALane,
    middleOfEachRow: readonly number[],
): string {
    const xOfTheEdge = xOfTheLane(edge.lane);
    const yOfTheNodeLeft = middleOfEachRow[edge.fromRow];
    const yOfTheNodeReached = middleOfEachRow[edge.toRow];
    const yHalfway = (yOfTheNodeLeft + yOfTheNodeReached) / 2;
    const pointing = Math.sign(yOfTheNodeReached - yOfTheNodeLeft);
    const yOfTheBase = yHalfway - pointing * TRAJECTORY_ARROWHEAD_HALF_LENGTH;
    const yOfTheTip = yHalfway + pointing * TRAJECTORY_ARROWHEAD_HALF_LENGTH;
    const arrowheadDrawn = [
        `M ${xOfTheEdge - TRAJECTORY_ARROWHEAD_HALF_WIDTH} ${yOfTheBase}`,
        `L ${xOfTheEdge + TRAJECTORY_ARROWHEAD_HALF_WIDTH} ${yOfTheBase}`,
        `L ${xOfTheEdge} ${yOfTheTip}`,
        "Z",
    ].join(" ");
    return arrowheadDrawn;
}
