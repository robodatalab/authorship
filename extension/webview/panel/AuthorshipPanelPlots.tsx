import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent as ReactDragEvent,
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
    AuthorshipPanelSections,
    type AuthorshipPanelSection,
} from "./AuthorshipPanelSections";
import {
    PlotTrajectoryLanes,
    type PlotEdgeInALane,
} from "./PlotTrajectoryLanes";
import { replaceTheCell } from "../author_editor/AuthorFileEditorCanvas";
import {
    AuthorFileEditorCellFields,
    type AuthorFileEditorCellField,
} from "../author_editor/AuthorFileEditorCellFields";
import {
    StoryAnnotationsIterator,
    type StoryAnnotationInTheStory,
    type StoryWordRangeInTheStory,
} from "../../library/storydoc/iterators/story_annotations_iterator";
import {
    PLOT,
    PlotCell,
    type PlotNode,
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
const ADD_AN_EVENT =
    "Add an event to the trajectory, told by the selected words if any are selected";
const TAKE_THE_NODE_OUT = "Take this event out of the trajectory";
const TOLD_BY_NO_WORDS = "Not told in the story yet";
const UNTITLED_EVENT = "Untitled event";
const ASSIGN_THE_WORDS_SELECTED = "Assign the selected words to this event";
const DELETE_THE_STORY_TEXT = "Delete the story text of this event";
// How many of the words that tell an untitled event its row shows.
const FIRST_WORDS_SHOWN = 6;
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
    const eventShown = plotCellShown?.nodes.find(
        (node) => node.nodeId === storyAnnotationSelected.passageId,
    );
    const passageOfTheEventShown =
        plotShown?.passages.find(
            (passage) => passage.passageId === eventShown?.nodeId,
        ) ?? null;

    function retitleThePlot(plotCellId: string, title: string): void {
        const plotCell = story?.cellWithId(plotCellId);
        if (plotCell === undefined) {
            return;
        }
        const retitling = new StoryAnnotationRetitled(title);
        const retitled = plotCell.accept<Cell>(retitling);
        replaceTheCell(sendMessagesToVscode, retitled);
    }

    const sections: AuthorshipPanelSection[] = [
        {
            name: "plots",
            content: (
                <AuthorshipPanelStoryAnnotationsList
                    cellKind={PLOT}
                    storyAnnotations={plots}
                    annotationShown={plotShown}
                    wording={PLOTS_LIST_WORDING}
                    sendMessagesToVscode={sendMessagesToVscode}
                />
            ),
        },
    ];
    if (plots.length > 0) {
        sections.push({
            name: "plot",
            content:
                plotShown === undefined || plotCellShown === undefined ? (
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
                        nodeIdSelected={storyAnnotationSelected.passageId}
                        storyTextSelected={storyTextSelected}
                        onRetitled={(title) =>
                            retitleThePlot(plotShown.annotationCellId, title)
                        }
                        sendMessagesToVscode={sendMessagesToVscode}
                    />
                ),
        });
    }
    if (plotCellShown !== undefined && eventShown !== undefined) {
        sections.push({
            name: "event",
            content: (
                <AuthorshipPanelPlotEvent
                    key={eventShown.nodeId}
                    plotCell={plotCellShown}
                    plotNode={eventShown}
                    passage={passageOfTheEventShown}
                    storyTextSelected={storyTextSelected}
                    sendMessagesToVscode={sendMessagesToVscode}
                />
            ),
        });
    }

    return (
        <div className="authorship-panel-story-annotations">
            <AuthorshipPanelSections sections={sections} />
        </div>
    );
}

interface AuthorshipPanelPlotEventProps {
    plotCell: PlotCell;
    plotNode: PlotNode;
    passage: StoryWordRangeInTheStory | null;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

// The event selected in a plot's trajectory: what it is, when and where it
// happens, and the story text that tells it.
function AuthorshipPanelPlotEvent({
    plotCell,
    plotNode,
    passage,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorshipPanelPlotEventProps) {
    // Only what changed is sent, for the host to say of the event as the plot
    // stands there: the plot this page drew may be behind it.
    function sayOfTheEvent(field: string, said: string): void {
        sendMessagesToVscode({
            type: "invoke",
            commandName: "changePlotEvent",
            commandArguments: {
                annotationCellId: plotCell.uniqueId,
                nodeId: plotNode.nodeId,
                field,
                said,
            },
        });
    }

    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Title",
            said: plotNode.summary,
            onSaid: (summary) => sayOfTheEvent("summary", summary),
        },
        {
            label: "Timestamp",
            said: plotNode.timestamp,
            placeholder: "Story time",
            onSaid: (timestamp) => sayOfTheEvent("timestamp", timestamp),
        },
        {
            label: "Location",
            said: plotNode.location,
            placeholder: "Location in the story, comma separated",
            onSaid: (location) => sayOfTheEvent("location", location),
        },
    ];

    return (
        <section className="authorship-panel-story-annotation-details authorship-panel-plot-event">
            <h4>Event</h4>
            <AuthorFileEditorCellFields fields={fields} />
            <div className="authorship-panel-story-annotation-passages-heading">
                <h4>Story text</h4>
            </div>
            <ul className="authorship-panel-story-annotation-passages">
                <li className="authorship-panel-story-annotation-passage">
                    {passage === null ? (
                        <span className="authorship-panel-plot-event-untold">
                            {TOLD_BY_NO_WORDS}
                        </span>
                    ) : (
                        <button
                            type="button"
                            className="authorship-panel-story-annotation-passage-shown"
                            title={passage.wordsItCovers}
                            onClick={() =>
                                sendMessagesToVscode({
                                    type: "showStoryWordRange",
                                    firstWord: passage.firstWord,
                                    lastWord: passage.lastWord,
                                })
                            }
                        >
                            {passage.wordsItCovers}
                        </button>
                    )}
                    <button
                        type="button"
                        className="authorship-panel-story-annotation-assign"
                        title={ASSIGN_THE_WORDS_SELECTED}
                        aria-label={ASSIGN_THE_WORDS_SELECTED}
                        disabled={storyTextSelected === null}
                        onClick={() =>
                            sendMessagesToVscode({
                                type: "invoke",
                                commandName: "assignStoryTextToPlotEvent",
                                commandArguments: {
                                    annotationCellId: plotCell.uniqueId,
                                    nodeId: plotNode.nodeId,
                                    ...storyTextSelected,
                                },
                            })
                        }
                    >
                        <i className="codicon codicon-link" />
                    </button>
                    {passage !== null && (
                        <button
                            type="button"
                            className="authorship-panel-story-annotation-passage-removed"
                            title={DELETE_THE_STORY_TEXT}
                            aria-label={DELETE_THE_STORY_TEXT}
                            onClick={() =>
                                sendMessagesToVscode({
                                    type: "invoke",
                                    commandName: "removeStoryTextFromPlotEvent",
                                    commandArguments: {
                                        annotationCellId: plotCell.uniqueId,
                                        nodeId: plotNode.nodeId,
                                    },
                                })
                            }
                        >
                            <i className="codicon codicon-close" />
                        </button>
                    )}
                </li>
            </ul>
        </section>
    );
}

interface AuthorshipPanelPlotProps {
    plot: StoryAnnotationInTheStory;
    plotCell: PlotCell;
    nodeIdSelected: string | null;
    storyTextSelected: StoryTextSpan | null;
    onRetitled: (title: string) => void;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorshipPanelPlot({
    plot,
    plotCell,
    nodeIdSelected,
    storyTextSelected,
    onRetitled,
    sendMessagesToVscode,
}: AuthorshipPanelPlotProps) {
    // Selected words tell the event added; with none selected, the event is
    // added untold, and selected for the author to say what it is.
    function addAnEvent(): void {
        if (storyTextSelected !== null) {
            sendMessagesToVscode({
                type: "invoke",
                commandName: "assignStoryTextToPlot",
                commandArguments: {
                    annotationCellId: plot.annotationCellId,
                    ...storyTextSelected,
                },
            });
            return;
        }
        const nodeId = crypto.randomUUID();
        sendMessagesToVscode({
            type: "invoke",
            commandName: "addEventToPlot",
            commandArguments: { annotationCellId: plot.annotationCellId, nodeId },
        });
        sendMessagesToVscode({
            type: "selectPassage",
            cellKind: PLOT,
            passageId: nodeId,
        });
    }

    return (
        <section className="authorship-panel-story-annotation-details">
            <AuthorshipPanelStoryAnnotationTitleAndDescription
                annotationCellId={plot.annotationCellId}
                title={plot.title}
                description={plot.description}
                onRetitled={onRetitled}
                onRedescribed={(overview) =>
                    sendMessagesToVscode({
                        type: "invoke",
                        commandName: "redescribePlot",
                        commandArguments: {
                            annotationCellId: plot.annotationCellId,
                            overview,
                        },
                    })
                }
                sendMessagesToVscode={sendMessagesToVscode}
            />
            <div className="authorship-panel-story-annotation-passages-heading">
                <h4>Trajectory</h4>
                <button
                    type="button"
                    className="authorship-panel-story-annotation-assign"
                    title={ADD_AN_EVENT}
                    aria-label={ADD_AN_EVENT}
                    onClick={addAnEvent}
                >
                    <i className="codicon codicon-add" />
                </button>
            </div>
            {plotCell.nodes.length === 0 ? (
                <div className="authorship-panel-idle">
                    No events in the trajectory yet
                </div>
            ) : (
                <AuthorshipPanelPlotTrajectory
                    plotCell={plotCell}
                    passages={plot.passages}
                    nodeIdSelected={nodeIdSelected}
                    sendMessagesToVscode={sendMessagesToVscode}
                />
            )}
        </section>
    );
}

interface AuthorshipPanelPlotTrajectoryProps {
    plotCell: PlotCell;
    passages: readonly StoryWordRangeInTheStory[];
    nodeIdSelected: string | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorshipPanelPlotTrajectory({
    plotCell,
    passages,
    nodeIdSelected,
    sendMessagesToVscode,
}: AuthorshipPanelPlotTrajectoryProps) {
    const lanesDrawn = useRef<SVGSVGElement>(null);
    const [rowConnectedFrom, connectFromRow] = useState<number | null>(null);
    const [nodeIdDragged, dragTheNode] = useState<string | null>(null);
    const [rowDraggedOver, dragOverTheRow] = useState<number | null>(null);
    const [pointerAt, movePointerTo] = useState<[number, number] | null>(
        null,
    );
    const plotCellShown = useMemo(
        () =>
            nodeIdDragged === null || rowDraggedOver === null
                ? plotCell
                : plotCell.withNodeMovedInPlaceOf(
                      nodeIdDragged,
                      plotCell.nodes[rowDraggedOver].nodeId,
                  ),
        [plotCell, nodeIdDragged, rowDraggedOver],
    );
    const nodeIds = useMemo(
        () => plotCellShown.nodes.map((node) => node.nodeId),
        [plotCellShown],
    );
    // An event the story does not tell yet has no passage.
    const passagesShown = useMemo(
        () =>
            plotCellShown.nodes.map(
                (node) =>
                    passages.find(
                        (passage) => passage.passageId === node.nodeId,
                    ) ?? null,
            ),
        [plotCellShown, passages],
    );
    const lanes = useMemo(
        () => new PlotTrajectoryLanes(nodeIds, plotCellShown.edges),
        [nodeIds, plotCellShown],
    );
    const lanesWidth = lanes.lanesTaken * TRAJECTORY_LANE_WIDTH;
    const rowsHeight = passagesShown.length * TRAJECTORY_ROW_HEIGHT;
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
        sendMessagesToVscode({
            type: "invoke",
            commandName: "addEdgeToPlot",
            commandArguments: {
                annotationCellId: plotCell.uniqueId,
                fromNodeId: nodeIds[rowConnectedFrom],
                toNodeId: nodeIds[row],
            },
        });
    }

    function startDragging(row: number): void {
        dragTheNode(nodeIds[row]);
        dragOverTheRow(row);
    }

    function stopDragging(): void {
        dragTheNode(null);
        dragOverTheRow(null);
    }

    function letTheNodeDraggedBeDropped(event: ReactDragEvent): void {
        if (nodeIdDragged !== null) {
            event.preventDefault();
        }
    }

    function moveTheNodeDragged(): void {
        if (nodeIdDragged === null || rowDraggedOver === null) {
            return;
        }
        const inPlaceOfNodeId = plotCell.nodes[rowDraggedOver].nodeId;
        if (inPlaceOfNodeId === nodeIdDragged) {
            return;
        }
        sendMessagesToVscode({
            type: "invoke",
            commandName: "moveNodeInPlot",
            commandArguments: {
                annotationCellId: plotCell.uniqueId,
                nodeId: nodeIdDragged,
                inPlaceOfNodeId,
            },
        });
    }

    function disconnect(edgeId: string): void {
        sendMessagesToVscode({
            type: "invoke",
            commandName: "removeEdgeFromPlot",
            commandArguments: {
                annotationCellId: plotCell.uniqueId,
                edgeId,
            },
        });
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
            className={
                nodeIdDragged === null
                    ? "authorship-panel-plot-trajectory"
                    : "authorship-panel-plot-trajectory authorship-panel-plot-trajectory-dragging"
            }
            onMouseMove={followThePointer}
        >
            <ul
                className="authorship-panel-story-annotation-passages"
                style={{ paddingLeft: lanesWidth }}
                onDragOver={letTheNodeDraggedBeDropped}
                onDrop={moveTheNodeDragged}
            >
                {plotCellShown.nodes.map((plotNode, node) => {
                    const passage = passagesShown[node];
                    const told =
                        passage === null
                            ? TOLD_BY_NO_WORDS
                            : passage.wordsItCovers;
                    const said = [plotNode.timestamp, plotNode.location, told]
                        .filter((part) => part !== "")
                        .join(" · ");
                    const named =
                        plotNode.summary ||
                        (passage === null
                            ? UNTITLED_EVENT
                            : firstWordsOf(passage.wordsItCovers));
                    return (
                        <li
                            key={plotNode.nodeId}
                            className={`authorship-panel-story-annotation-passage${
                                plotNode.nodeId === nodeIdSelected
                                    ? " authorship-panel-story-annotation-passage-selected"
                                    : ""
                            }${
                                plotNode.nodeId === nodeIdDragged
                                    ? " authorship-panel-plot-trajectory-row-dragged"
                                    : ""
                            }`}
                            style={{ height: TRAJECTORY_ROW_HEIGHT }}
                            onMouseUp={() => connectTo(node)}
                            draggable
                            onDragStart={() => startDragging(node)}
                            onDragEnter={() => dragOverTheRow(node)}
                            onDragEnd={stopDragging}
                        >
                            <button
                                type="button"
                                className="authorship-panel-story-annotation-passage-shown"
                                title={said}
                                aria-pressed={plotNode.nodeId === nodeIdSelected}
                                onClick={() => {
                                    sendMessagesToVscode({
                                        type: "selectPassage",
                                        cellKind: PLOT,
                                        passageId: plotNode.nodeId,
                                    });
                                    if (passage === null) {
                                        return;
                                    }
                                    sendMessagesToVscode({
                                        type: "showStoryWordRange",
                                        firstWord: passage.firstWord,
                                        lastWord: passage.lastWord,
                                    });
                                }}
                            >
                                {named}
                            </button>
                            <button
                                type="button"
                                className="authorship-panel-story-annotation-passage-removed"
                                title={TAKE_THE_NODE_OUT}
                                aria-label={TAKE_THE_NODE_OUT}
                                onClick={() =>
                                    sendMessagesToVscode({
                                        type: "invoke",
                                        commandName: "removeNodeFromPlot",
                                        commandArguments: {
                                            annotationCellId: plotCell.uniqueId,
                                            nodeId: plotNode.nodeId,
                                        },
                                    })
                                }
                            >
                                <i className="codicon codicon-close" />
                            </button>
                        </li>
                    );
                })}
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
                            className={`authorship-panel-plot-trajectory-node${
                                nodeIds[node] === nodeIdSelected
                                    ? " authorship-panel-plot-trajectory-node-selected"
                                    : ""
                            }${
                                nodeIds[node] === nodeIdDragged
                                    ? " authorship-panel-plot-trajectory-node-dragged"
                                    : ""
                            } authorship-panel-plot-trajectory-lane-${lane % TRAJECTORY_LANE_COLORS}`}
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

function firstWordsOf(words: string): string {
    const each = words.split(" ");
    const first = each.slice(0, FIRST_WORDS_SHOWN).join(" ");
    return each.length > FIRST_WORDS_SHOWN ? `${first}…` : first;
}
