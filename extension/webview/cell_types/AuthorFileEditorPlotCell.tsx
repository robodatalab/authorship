import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent as ReactDragEvent,
    type MouseEvent as ReactMouseEvent,
} from "react";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellHeaderTitle,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    replaceTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    AuthorFileEditorCellReferences,
    type AuthorFileEditorCellReferencesWording,
} from "./AuthorFileEditorCellReferences";
import { AuthorFileEditorStoryAnnotationShownInTheManuscript } from "./AuthorFileEditorStoryAnnotationShownInTheManuscript";
import {
    PlotTrajectoryLanes,
    type PlotEdgeInALane,
} from "./PlotTrajectoryLanes";
import { CharacterCell } from "authordoc/cells/character_cell";
import { PlaceCell } from "authordoc/cells/place_cell";
import { PLOT, type PlotCell, type PlotNode } from "authordoc/cells/plot_cell";
import {
    StoryAnnotationsIterator,
    type StoryWordRangeInTheStory,
} from "authordoc/iterators/story_annotations_iterator";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";
import type { Document } from "authordoc/storydoc";
import "./StoryAnnotationCells.css";

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
const PLOT_CONCEPTS_WORDING: AuthorFileEditorCellReferencesWording = {
    heading: "Concepts",
    referenceOne: "Reference a salient concept from this plot",
    stopReferencing: "Stop referencing this concept",
    noneReferenced: "No concepts referenced yet",
    untitled: "Untitled concept",
};
const PLOT_CHARACTERS_WORDING: AuthorFileEditorCellReferencesWording = {
    heading: "Main characters",
    referenceOne: "Follow a character throughout this plot",
    stopReferencing: "Stop following this character",
    noneReferenced: "No main characters followed yet",
    untitled: "Untitled character",
};
const EVENT_PLACE_WORDING: AuthorFileEditorCellReferencesWording = {
    heading: "Place",
    referenceOne: "Choose the place the event happens in",
    stopReferencing: "Take the event out of this place",
    noneReferenced: "No place chosen yet",
    untitled: "Untitled place",
};
const EVENT_CHARACTERS_WORDING: AuthorFileEditorCellReferencesWording = {
    heading: "Characters",
    referenceOne: "Add a character to this event",
    stopReferencing: "Take this character out of the event",
    noneReferenced: "No characters in the event yet",
    untitled: "Untitled character",
};
const TRAJECTORY_ROW_HEIGHT = 22;
const TRAJECTORY_LANE_WIDTH = 14;
const TRAJECTORY_NODE_RADIUS = 4;
const TRAJECTORY_ARROWHEAD_HALF_WIDTH = 3.5;
const TRAJECTORY_ARROWHEAD_HALF_LENGTH = 2.5;
const TRAJECTORY_LANE_COLORS = 6;

interface AuthorFileEditorPlotCellProps {
    cell: PlotCell;
    story: Document;
    isShownInTheManuscript: boolean;
    eventIdSelected: string | null;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorPlotCell({
    cell,
    story,
    isShownInTheManuscript,
    eventIdSelected,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorFileEditorPlotCellProps) {
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();
    const passages = useMemo(() => {
        const plotsInTheStory = new StoryAnnotationsIterator(story, PLOT);
        const plotInTheStory = Array.from(plotsInTheStory).find(
            (plot) => plot.annotationCellId === cell.uniqueId,
        );
        return plotInTheStory?.passages ?? [];
    }, [story, cell.uniqueId]);
    const eventSelected = cell.nodes.find(
        (node) => node.nodeId === eventIdSelected,
    );
    const passageOfTheEventSelected =
        passages.find((passage) => passage.passageId === eventIdSelected) ??
        null;
    const conceptsReferenced = cell.concepts(story);
    const conceptIdsReferenced = conceptsReferenced.map(
        (concept) => concept.uniqueId,
    );
    const conceptsToChoose = story
        .salientConcepts()
        .filter((concept) => !conceptIdsReferenced.includes(concept.uniqueId));
    const charactersFollowed = cell.characters(story);
    const characterIdsFollowed = charactersFollowed.map(
        (character) => character.uniqueId,
    );
    const charactersInTheStory = story.cells.filter(
        (storyCell) => storyCell instanceof CharacterCell,
    );
    const charactersToFollow = charactersInTheStory.filter(
        (character) => !characterIdsFollowed.includes(character.uniqueId),
    );
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Title",
            said: cell.title,
            onSaid: (title) => {
                const retitled = cell.withTitle(title);
                replaceTheCell(sendMessagesToVscode, retitled);
            },
        },
    ];

    function selectTheEvent(nodeId: string): void {
        if (!isShownInTheManuscript) {
            sendMessagesToVscode({
                type: "selectStoryAnnotation",
                cellKind: PLOT,
                annotationCellId: cell.uniqueId,
            });
        }
        sendMessagesToVscode({
            type: "selectPassage",
            cellKind: PLOT,
            passageId: nodeId,
        });
    }

    // Selected words tell the event added; with none selected, the event is
    // added untold, and selected for the author to say what it is.
    function addAnEvent(): void {
        if (storyTextSelected !== null) {
            sendMessagesToVscode({
                type: "invoke",
                commandName: "assignStoryTextToPlot",
                commandArguments: {
                    annotationCellId: cell.uniqueId,
                    ...storyTextSelected,
                },
            });
            return;
        }
        const nodeId = crypto.randomUUID();
        sendMessagesToVscode({
            type: "invoke",
            commandName: "addEventToPlot",
            commandArguments: { annotationCellId: cell.uniqueId, nodeId },
        });
        selectTheEvent(nodeId);
    }

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                Plot
                <AuthorFileEditorCellHeaderTitle title={cell.title} />
                <AuthorFileEditorStoryAnnotationShownInTheManuscript
                    cellKind={PLOT}
                    annotationCellId={cell.uniqueId}
                    isShown={isShownInTheManuscript}
                    sendMessagesToVscode={sendMessagesToVscode}
                />
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields fields={fields} />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        cellId={cell.uniqueId}
                        markdown={cell.overview}
                        timesTheHostWroteIt={timesTheHostWroteIt}
                        onMarkdownCommitted={(overview) =>
                            sendMessagesToVscode({
                                type: "invoke",
                                commandName: "redescribePlot",
                                commandArguments: {
                                    annotationCellId: cell.uniqueId,
                                    overview,
                                },
                            })
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellReferences
                        className="author-file-editor-plot-concepts"
                        referencedCells={conceptsReferenced}
                        cellsToChoose={conceptsToChoose}
                        wording={PLOT_CONCEPTS_WORDING}
                        onReferenced={(conceptCellId) =>
                            sendMessagesToVscode({
                                type: "invoke",
                                commandName: "addConceptToPlot",
                                commandArguments: {
                                    annotationCellId: cell.uniqueId,
                                    conceptCellId,
                                },
                            })
                        }
                        onStoppedReferencing={(conceptCellId) =>
                            sendMessagesToVscode({
                                type: "invoke",
                                commandName: "removeConceptFromPlot",
                                commandArguments: {
                                    annotationCellId: cell.uniqueId,
                                    conceptCellId,
                                },
                            })
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellReferences
                        className="author-file-editor-plot-characters"
                        referencedCells={charactersFollowed}
                        cellsToChoose={charactersToFollow}
                        wording={PLOT_CHARACTERS_WORDING}
                        onReferenced={(characterCellId) =>
                            sendMessagesToVscode({
                                type: "invoke",
                                commandName: "addCharacterToPlot",
                                commandArguments: {
                                    annotationCellId: cell.uniqueId,
                                    characterCellId,
                                },
                            })
                        }
                        onStoppedReferencing={(characterCellId) =>
                            sendMessagesToVscode({
                                type: "invoke",
                                commandName: "removeCharacterFromPlot",
                                commandArguments: {
                                    annotationCellId: cell.uniqueId,
                                    characterCellId,
                                },
                            })
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <div className="author-file-editor-story-annotation-passages-heading">
                        <h4>Trajectory</h4>
                        <button
                            type="button"
                            className="author-file-editor-story-annotation-assign"
                            title={ADD_AN_EVENT}
                            aria-label={ADD_AN_EVENT}
                            onClick={addAnEvent}
                        >
                            <i className="codicon codicon-add" />
                        </button>
                    </div>
                    {cell.nodes.length === 0 ? (
                        <div className="author-file-editor-idle">
                            No events in the trajectory yet
                        </div>
                    ) : (
                        <AuthorFileEditorPlotTrajectory
                            story={story}
                            plotCell={cell}
                            passages={passages}
                            nodeIdSelected={eventIdSelected}
                            onEventSelected={selectTheEvent}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
                </AuthorFileEditorCellCard>
                {eventSelected !== undefined && (
                    <AuthorFileEditorCellCard>
                        <AuthorFileEditorPlotEvent
                            key={eventSelected.nodeId}
                            story={story}
                            plotCell={cell}
                            plotNode={eventSelected}
                            passage={passageOfTheEventSelected}
                            storyTextSelected={storyTextSelected}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    </AuthorFileEditorCellCard>
                )}
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

interface AuthorFileEditorPlotEventProps {
    story: Document;
    plotCell: PlotCell;
    plotNode: PlotNode;
    passage: StoryWordRangeInTheStory | null;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

// The event selected in a plot's trajectory: what it is, when and where it
// happens, and the story text that tells it.
function AuthorFileEditorPlotEvent({
    story,
    plotCell,
    plotNode,
    passage,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorFileEditorPlotEventProps) {
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
            label: "Summary",
            said: plotNode.summary,
            multiline: true,
            onSaid: (summary) => sayOfTheEvent("summary", summary),
        },
        {
            label: "Timestamp",
            said: plotNode.timestamp,
            placeholder: "Story time",
            onSaid: (timestamp) => sayOfTheEvent("timestamp", timestamp),
        },
    ];
    const place = plotNode.place(story);
    const placeReferenced = place === undefined ? [] : [place];
    const placesInTheStory = story.cells.filter(
        (cell) => cell instanceof PlaceCell,
    );
    const placesToChoose = placesInTheStory.filter(
        (other) => other.uniqueId !== plotNode.placeId,
    );
    const charactersReferenced = plotNode.characters(story);
    const charactersInTheStory = story.cells.filter(
        (cell) => cell instanceof CharacterCell,
    );
    const charactersToChoose = charactersInTheStory.filter(
        (character) => !plotNode.characterIds.includes(character.uniqueId),
    );

    function sayOfTheEventsCharacter(
        commandName: string,
        characterCellId: string,
    ): void {
        sendMessagesToVscode({
            type: "invoke",
            commandName,
            commandArguments: {
                annotationCellId: plotCell.uniqueId,
                nodeId: plotNode.nodeId,
                characterCellId,
            },
        });
    }

    return (
        <section className="author-file-editor-plot-event">
            <div className="author-file-editor-story-annotation-passages-heading">
                <h4>Event</h4>
            </div>
            <AuthorFileEditorCellFields fields={fields} />
            <AuthorFileEditorCellReferences
                className="author-file-editor-plot-event-place"
                referencedCells={placeReferenced}
                cellsToChoose={placesToChoose}
                wording={EVENT_PLACE_WORDING}
                onReferenced={(placeCellId) =>
                    sayOfTheEvent("place", placeCellId)
                }
                onStoppedReferencing={() => sayOfTheEvent("place", "")}
            />
            <AuthorFileEditorCellReferences
                className="author-file-editor-plot-event-characters"
                referencedCells={charactersReferenced}
                cellsToChoose={charactersToChoose}
                wording={EVENT_CHARACTERS_WORDING}
                onReferenced={(characterCellId) =>
                    sayOfTheEventsCharacter(
                        "addCharacterToPlotEvent",
                        characterCellId,
                    )
                }
                onStoppedReferencing={(characterCellId) =>
                    sayOfTheEventsCharacter(
                        "removeCharacterFromPlotEvent",
                        characterCellId,
                    )
                }
            />
            <div className="author-file-editor-story-annotation-passages-heading">
                <h4>Story text</h4>
            </div>
            <ul className="author-file-editor-story-annotation-passages author-file-editor-plot-event-story-text">
                <li className="author-file-editor-story-annotation-passage">
                    {passage === null ? (
                        <span className="author-file-editor-plot-event-untold">
                            {TOLD_BY_NO_WORDS}
                        </span>
                    ) : (
                        <button
                            type="button"
                            className="author-file-editor-story-annotation-passage-shown"
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
                        className="author-file-editor-story-annotation-assign"
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
                            className="author-file-editor-story-annotation-passage-removed"
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

interface AuthorFileEditorPlotTrajectoryProps {
    story: Document;
    plotCell: PlotCell;
    passages: readonly StoryWordRangeInTheStory[];
    nodeIdSelected: string | null;
    onEventSelected: (nodeId: string) => void;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorFileEditorPlotTrajectory({
    story,
    plotCell,
    passages,
    nodeIdSelected,
    onEventSelected,
    sendMessagesToVscode,
}: AuthorFileEditorPlotTrajectoryProps) {
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
                    ? "author-file-editor-plot-trajectory"
                    : "author-file-editor-plot-trajectory author-file-editor-plot-trajectory-dragging"
            }
            onMouseMove={followThePointer}
        >
            <ul
                className="author-file-editor-story-annotation-passages"
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
                    const place = plotNode.place(story);
                    const placeNamed = place?.title ?? "";
                    const said = [plotNode.timestamp, placeNamed, told]
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
                            className={`author-file-editor-story-annotation-passage${
                                plotNode.nodeId === nodeIdSelected
                                    ? " author-file-editor-story-annotation-passage-selected"
                                    : ""
                            }${
                                plotNode.nodeId === nodeIdDragged
                                    ? " author-file-editor-plot-trajectory-row-dragged"
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
                                className="author-file-editor-story-annotation-passage-shown"
                                title={said}
                                aria-pressed={plotNode.nodeId === nodeIdSelected}
                                onClick={() => {
                                    onEventSelected(plotNode.nodeId);
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
                                className="author-file-editor-story-annotation-passage-removed"
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
                className="author-file-editor-plot-trajectory-lanes"
                width={lanesWidth}
                height={rowsHeight}
            >
                {lanes.edgesInLanes.map((edge) => {
                    const edgeDrawn = pathOfTheEdge(edge, lanes.laneOfEachNode);
                    const arrowheadDrawn = arrowheadOfTheEdge(edge);
                    return (
                        <g
                            key={edge.edgeId}
                            className={`author-file-editor-plot-trajectory-edge author-file-editor-plot-trajectory-lane-${edge.lane % TRAJECTORY_LANE_COLORS}`}
                            role="button"
                            aria-label={DISCONNECT_THE_NODES}
                            onClick={() => disconnect(edge.edgeId)}
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
                    const yOfTheNode = yOfTheRow(node);
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

registerAuthorDocumentCellType({
    cellKind: PLOT,
    menuLabel: "Plot",
    insertMenuGroup: "primary",
});
