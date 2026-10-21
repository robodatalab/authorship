import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
} from "react";
import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import {
    AuthorshipPanelStoryAnnotationsList,
    type AuthorshipPanelStoryAnnotationsListWording,
} from "./AuthorshipPanelStoryAnnotationsList";
import { AuthorshipPanelStoryAnnotationTitleAndDescription } from "./AuthorshipPanelStoryAnnotationTitleAndDescription";
import { StoryAnnotationRetitled } from "./StoryAnnotationRetitled";
import {
    PlotTrajectoryLanes,
    type PlotEdgeInALane,
} from "./PlotTrajectoryLanes";
import { replaceTheCell } from "../author_editor/AuthorFileEditorCanvas";
import {
    StoryAnnotationsIterator,
    type StoryAnnotationInTheStory,
    type StoryWordRangeInTheStory,
} from "../../library/storydoc/iterators/story_annotations_iterator";
import {
    PLOT,
    PlotCell,
    PlotEdge,
} from "../../library/storydoc/cells/plot_cell";
import type { StoryAnnotationSelected } from "../../vscode_runtime/story_annotation_selection";
import type { StoryTextSpan } from "../../library/storydoc/iterators/story_words_iterator";
import type { Cell } from "../../library/storydoc/cells/cell";
import type { Document } from "../../library/storydoc/storydoc";
import "./AuthorshipPanelStoryAnnotations.css";
import "./AuthorshipPanelPlots.css";

const PLOTS_LIST_WORDING: AuthorshipPanelStoryAnnotationsListWording = {
    addAnAnnotation: "Add a plot",
    noAnnotationsYet: "No plots yet",
    deleteTheAnnotation: "Delete this plot",
    passagesCounted: "Spans",
};
const ADD_THE_WORDS_SELECTED = "Add the selected words to the trajectory";
const TAKE_THE_NODE_OUT = "Take these words out of the trajectory";
const DISCONNECT_THE_NODES = "Disconnect these nodes";
const TRAJECTORY_ROW_HEIGHT = 22;
const TRAJECTORY_LANE_WIDTH = 14;
const TRAJECTORY_NODE_RADIUS = 4;
const TRAJECTORY_ARROWHEAD_HALF_WIDTH = 3.5;
const TRAJECTORY_ARROWHEAD_HALF_LENGTH = 2.5;
const TRAJECTORY_LANE_COLORS = 6;

interface AuthorshipPanelPlotsProps {
    story: Document | null;
    storyAnnotationSelected: StoryAnnotationSelected;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelPlots({
    story,
    storyAnnotationSelected,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorshipPanelPlotsProps) {
    const plots = useMemo(() => {
        if (story === null) {
            return null;
        }
        const plotsInTheStory = new StoryAnnotationsIterator(story, PLOT);
        return Array.from(plotsInTheStory);
    }, [story]);
    if (story === null || plots === null) {
        return <div className="authorship-panel-idle">No manuscript open</div>;
    }
    const plotShown = plots.find(
        (plot) =>
            plot.annotationCellId === storyAnnotationSelected.annotationCellId,
    );
    const plotCellShown = story
        .plots()
        .find(
            (plotCell) =>
                plotCell.uniqueId === storyAnnotationSelected.annotationCellId,
        );

    function retitleThePlot(plotCellId: string, title: string): void {
        const plotCell = story?.cellWithId(plotCellId);
        if (plotCell === undefined) {
            return;
        }
        const retitling = new StoryAnnotationRetitled(title);
        const retitled = plotCell.accept<Cell>(retitling);
        replaceTheCell(sendMessagesToVscode, retitled);
    }

    return (
        <div className="authorship-panel-story-annotations">
            <AuthorshipPanelStoryAnnotationsList
                cellKind={PLOT}
                storyAnnotations={plots}
                annotationShown={plotShown}
                wording={PLOTS_LIST_WORDING}
                sendMessagesToVscode={sendMessagesToVscode}
            />
            {plots.length > 0 &&
                (plotShown === undefined || plotCellShown === undefined ? (
                    <section className="authorship-panel-story-annotation-details">
                        <div className="authorship-panel-idle">
                            Select a plot to see its abstract and trajectory
                        </div>
                    </section>
                ) : (
                    <AuthorshipPanelPlot
                        key={plotShown.annotationCellId}
                        plot={plotShown}
                        plotCell={plotCellShown}
                        nodeSelected={storyAnnotationSelected.passage}
                        storyTextSelected={storyTextSelected}
                        onRetitled={(title) =>
                            retitleThePlot(plotShown.annotationCellId, title)
                        }
                        sendMessagesToVscode={sendMessagesToVscode}
                    />
                ))}
        </div>
    );
}

interface AuthorshipPanelPlotProps {
    plot: StoryAnnotationInTheStory;
    plotCell: PlotCell;
    nodeSelected: number | null;
    storyTextSelected: StoryTextSpan | null;
    onRetitled: (title: string) => void;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorshipPanelPlot({
    plot,
    plotCell,
    nodeSelected,
    storyTextSelected,
    onRetitled,
    sendMessagesToVscode,
}: AuthorshipPanelPlotProps) {
    return (
        <section className="authorship-panel-story-annotation-details">
            <AuthorshipPanelStoryAnnotationTitleAndDescription
                annotationCellId={plot.annotationCellId}
                title={plot.title}
                description={plot.description}
                onRetitled={onRetitled}
                sendMessagesToVscode={sendMessagesToVscode}
            />
            <div className="authorship-panel-story-annotation-passages-heading">
                <h4>Trajectory</h4>
                <button
                    type="button"
                    className="authorship-panel-story-annotation-assign"
                    title={ADD_THE_WORDS_SELECTED}
                    aria-label={ADD_THE_WORDS_SELECTED}
                    disabled={storyTextSelected === null}
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "assignStoryTextToPlot",
                            commandArguments: {
                                annotationCellId: plot.annotationCellId,
                                ...storyTextSelected,
                            },
                        })
                    }
                >
                    <i className="codicon codicon-add" />
                </button>
            </div>
            {plot.passages.length === 0 ? (
                <div className="authorship-panel-idle">
                    No words in the trajectory yet
                </div>
            ) : (
                <AuthorshipPanelPlotTrajectory
                    plotCell={plotCell}
                    passages={plot.passages}
                    nodeSelected={nodeSelected}
                    sendMessagesToVscode={sendMessagesToVscode}
                />
            )}
        </section>
    );
}

interface AuthorshipPanelPlotTrajectoryProps {
    plotCell: PlotCell;
    passages: readonly StoryWordRangeInTheStory[];
    nodeSelected: number | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorshipPanelPlotTrajectory({
    plotCell,
    passages,
    nodeSelected,
    sendMessagesToVscode,
}: AuthorshipPanelPlotTrajectoryProps) {
    const lanesDrawn = useRef<SVGSVGElement>(null);
    const [rowConnectedFrom, connectFromRow] = useState<number | null>(null);
    const [pointerAt, movePointerTo] = useState<[number, number] | null>(
        null,
    );
    const nodeIds = useMemo(
        () => plotCell.nodes.map((node) => node.nodeId),
        [plotCell],
    );
    const lanes = useMemo(
        () => new PlotTrajectoryLanes(nodeIds, plotCell.edges),
        [nodeIds, plotCell],
    );
    const lanesWidth = lanes.lanesTaken * TRAJECTORY_LANE_WIDTH;
    const rowsHeight = passages.length * TRAJECTORY_ROW_HEIGHT;
    const xConnectedFrom =
        rowConnectedFrom === null
            ? null
            : xOfTheLane(lanes.laneOfEachNode[rowConnectedFrom]);
    const yConnectedFrom =
        rowConnectedFrom === null ? null : yOfTheRow(rowConnectedFrom);

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
        const fromNodeId = nodeIds[rowConnectedFrom];
        const toNodeId = nodeIds[row];
        const alreadyConnected = plotCell.edges.some(
            (edge) =>
                edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId,
        );
        if (alreadyConnected) {
            return;
        }
        const edgeId = crypto.randomUUID();
        const edgeAdded = new PlotEdge(edgeId, fromNodeId, toNodeId);
        const connected = new PlotCell(
            plotCell.title,
            plotCell.nodes,
            [...plotCell.edges, edgeAdded],
            plotCell.source,
            plotCell.folded,
            plotCell.at,
            plotCell.uniqueId,
        );
        replaceTheCell(sendMessagesToVscode, connected);
    }

    function disconnect(edgeId: string): void {
        const edgesKept = plotCell.edges.filter(
            (edge) => edge.edgeId !== edgeId,
        );
        const disconnected = new PlotCell(
            plotCell.title,
            plotCell.nodes,
            edgesKept,
            plotCell.source,
            plotCell.folded,
            plotCell.at,
            plotCell.uniqueId,
        );
        replaceTheCell(sendMessagesToVscode, disconnected);
    }

    function takeOut(nodeId: string): void {
        const nodesKept = plotCell.nodes.filter(
            (node) => node.nodeId !== nodeId,
        );
        const edgesKept = plotCell.edges.filter(
            (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId,
        );
        const takenOut = new PlotCell(
            plotCell.title,
            nodesKept,
            edgesKept,
            plotCell.source,
            plotCell.folded,
            plotCell.at,
            plotCell.uniqueId,
        );
        replaceTheCell(sendMessagesToVscode, takenOut);
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
        <div
            className="authorship-panel-plot-trajectory"
            onMouseMove={followThePointer}
        >
            <ul
                className="authorship-panel-story-annotation-passages"
                style={{ paddingLeft: lanesWidth }}
            >
                {passages.map((storyWordRange, node) => (
                    <li
                        key={`${storyWordRange.firstWord}-${storyWordRange.lastWord}`}
                        className={
                            node === nodeSelected
                                ? "authorship-panel-story-annotation-passage authorship-panel-story-annotation-passage-selected"
                                : "authorship-panel-story-annotation-passage"
                        }
                        style={{ height: TRAJECTORY_ROW_HEIGHT }}
                        onMouseUp={() => connectTo(node)}
                    >
                        <button
                            type="button"
                            className="authorship-panel-story-annotation-passage-shown"
                            title={storyWordRange.wordsItCovers}
                            aria-pressed={node === nodeSelected}
                            onClick={() => {
                                sendMessagesToVscode({
                                    type: "selectPassage",
                                    cellKind: PLOT,
                                    passage: node,
                                });
                                sendMessagesToVscode({
                                    type: "showStoryWordRange",
                                    firstWord: storyWordRange.firstWord,
                                    lastWord: storyWordRange.lastWord,
                                });
                            }}
                        >
                            {storyWordRange.wordsItCovers}
                        </button>
                        <button
                            type="button"
                            className="authorship-panel-story-annotation-passage-removed"
                            title={TAKE_THE_NODE_OUT}
                            aria-label={TAKE_THE_NODE_OUT}
                            onClick={() => takeOut(nodeIds[node])}
                        >
                            <i className="codicon codicon-close" />
                        </button>
                    </li>
                ))}
            </ul>
            <svg
                ref={lanesDrawn}
                className="authorship-panel-plot-trajectory-lanes"
                width={lanesWidth}
                height={rowsHeight}
            >
                {lanes.edgesInLanes.map((edge) => {
                    const edgeDrawn = pathOfTheEdge(edge, lanes.laneOfEachNode);
                    const arrowheadDrawn = arrowheadOfTheEdge(edge);
                    return (
                        <g
                            key={edge.edgeId}
                            className={`authorship-panel-plot-trajectory-edge authorship-panel-plot-trajectory-lane-${edge.lane % TRAJECTORY_LANE_COLORS}`}
                            role="button"
                            aria-label={DISCONNECT_THE_NODES}
                            onClick={() => disconnect(edge.edgeId)}
                        >
                            <title>{DISCONNECT_THE_NODES}</title>
                            <path
                                className="authorship-panel-plot-trajectory-edge-line"
                                d={edgeDrawn}
                            />
                            <path
                                className="authorship-panel-plot-trajectory-edge-arrowhead"
                                d={arrowheadDrawn}
                            />
                            <path
                                className="authorship-panel-plot-trajectory-edge-grip"
                                d={edgeDrawn}
                            />
                        </g>
                    );
                })}
                {lanes.laneOfEachNode.map((lane, node) => {
                    const xOfTheNode = xOfTheLane(lane);
                    const yOfTheNode = yOfTheRow(node);
                    return (
                        <circle
                            key={nodeIds[node]}
                            className={
                                node === nodeSelected
                                    ? `authorship-panel-plot-trajectory-node authorship-panel-plot-trajectory-node-selected authorship-panel-plot-trajectory-lane-${lane % TRAJECTORY_LANE_COLORS}`
                                    : `authorship-panel-plot-trajectory-node authorship-panel-plot-trajectory-lane-${lane % TRAJECTORY_LANE_COLORS}`
                            }
                            cx={xOfTheNode}
                            cy={yOfTheNode}
                            r={TRAJECTORY_NODE_RADIUS}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                connectFromRow(node);
                            }}
                            onMouseUp={() => connectTo(node)}
                        />
                    );
                })}
                {xConnectedFrom !== null &&
                    yConnectedFrom !== null &&
                    pointerAt !== null && (
                        <line
                            className="authorship-panel-plot-trajectory-connection"
                            x1={xConnectedFrom}
                            y1={yConnectedFrom}
                            x2={pointerAt[0]}
                            y2={pointerAt[1]}
                        />
                    )}
            </svg>
        </div>
    );
}

function xOfTheLane(lane: number): number {
    return (lane + 0.5) * TRAJECTORY_LANE_WIDTH;
}

function yOfTheRow(row: number): number {
    return (row + 0.5) * TRAJECTORY_ROW_HEIGHT;
}

function pathOfTheEdge(
    edge: PlotEdgeInALane,
    laneOfEachNode: readonly number[],
): string {
    const topRow = Math.min(edge.fromRow, edge.toRow);
    const bottomRow = Math.max(edge.fromRow, edge.toRow);
    const xOfTheTopNode = xOfTheLane(laneOfEachNode[topRow]);
    const xOfTheBottomNode = xOfTheLane(laneOfEachNode[bottomRow]);
    const xOfTheEdge = xOfTheLane(edge.lane);
    const yOfTheTopNode = yOfTheRow(topRow);
    const yOfTheBottomNode = yOfTheRow(bottomRow);
    const halfARow = TRAJECTORY_ROW_HEIGHT / 2;
    const edgeDrawn = [
        `M ${xOfTheTopNode} ${yOfTheTopNode}`,
        `Q ${xOfTheEdge} ${yOfTheTopNode} ${xOfTheEdge} ${yOfTheTopNode + halfARow}`,
        `L ${xOfTheEdge} ${yOfTheBottomNode - halfARow}`,
        `Q ${xOfTheEdge} ${yOfTheBottomNode} ${xOfTheBottomNode} ${yOfTheBottomNode}`,
    ].join(" ");
    return edgeDrawn;
}

function arrowheadOfTheEdge(edge: PlotEdgeInALane): string {
    const xOfTheEdge = xOfTheLane(edge.lane);
    const yOfTheNodeLeft = yOfTheRow(edge.fromRow);
    const yOfTheNodeReached = yOfTheRow(edge.toRow);
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
