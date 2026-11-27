import { useMemo, type ReactNode } from "react";
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
import {
    AuthorFileEditorReorderableList,
    type AuthorFileEditorReorderableListItemDragging,
} from "../author_editor/AuthorFileEditorReorderableList";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/runtime_commands/author_document_cell_types";
import {
    replaceTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    AuthorFileEditorCellReferences,
    type AuthorFileEditorCellReferencesWording,
} from "./AuthorFileEditorCellReferences";
import { AuthorFileEditorPlotEvent } from "./AuthorFileEditorPlotEvent";
import { AuthorFileEditorPlotTrajectoryLanes } from "./AuthorFileEditorPlotTrajectoryLanes";
import { AuthorFileEditorStoryAnnotationShownInTheManuscript } from "./AuthorFileEditorStoryAnnotationShownInTheManuscript";
import {
    NO_STORY_ANNOTATION_SELECTED,
    useAuthorFileEditorSelection,
} from "../author_editor/AuthorFileEditorSelectionFence";
import { CharacterCell } from "authordoc/cells/character_cell";
import { PLOT, type PlotCell } from "authordoc/cells/plot_cell";
import { StoryAnnotationsIterator } from "authordoc/iterators/story_annotations_iterator";
import type { Document } from "authordoc/storydoc";
import "./StoryAnnotationCells.css";

const ADD_AN_EVENT =
    "Add an event to the trajectory, told by the selected words if any are selected";
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

interface AuthorFileEditorPlotCellProps {
    cell: PlotCell;
    story: Document;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorPlotCell({
    cell,
    story,
    sendMessagesToVscode,
}: AuthorFileEditorPlotCellProps) {
    const {
        storyAnnotationsSelected,
        storyTextSelected,
        selectTheStoryAnnotation,
        selectThePassage,
    } = useAuthorFileEditorSelection();
    const plotSelected =
        storyAnnotationsSelected[PLOT] ?? NO_STORY_ANNOTATION_SELECTED;
    const isShownInTheManuscript =
        plotSelected.annotationCellId === cell.uniqueId;
    const eventIdSelected = isShownInTheManuscript
        ? plotSelected.passageId
        : null;
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();
    const passages = useMemo(() => {
        const plotsInTheStory = new StoryAnnotationsIterator(story, PLOT);
        const plotInTheStory = Array.from(plotsInTheStory).find(
            (plot) => plot.annotationCellId === cell.uniqueId,
        );
        return plotInTheStory?.passages ?? [];
    }, [story, cell.uniqueId]);
    const nodeIds = cell.nodes.map((node) => node.nodeId);
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
            selectTheStoryAnnotation(PLOT, cell.uniqueId);
        }
        selectThePassage(PLOT, nodeId);
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

    function moveTheNode(nodeId: string, inPlaceOfNodeId: string): void {
        sendMessagesToVscode({
            type: "invoke",
            commandName: "moveNodeInPlot",
            commandArguments: {
                annotationCellId: cell.uniqueId,
                nodeId,
                inPlaceOfNodeId,
            },
        });
    }

    function connect(fromNodeId: string, toNodeId: string): void {
        sendMessagesToVscode({
            type: "invoke",
            commandName: "addEdgeToPlot",
            commandArguments: {
                annotationCellId: cell.uniqueId,
                fromNodeId,
                toNodeId,
            },
        });
    }

    function disconnect(edgeId: string): void {
        sendMessagesToVscode({
            type: "invoke",
            commandName: "removeEdgeFromPlot",
            commandArguments: {
                annotationCellId: cell.uniqueId,
                edgeId,
            },
        });
    }

    function drawTheLanes(
        nodeIdsShown: readonly string[],
        nodeIdDragged: string | null,
        heightOfEachEvent: readonly number[],
    ): ReactNode {
        return (
            <AuthorFileEditorPlotTrajectoryLanes
                nodeIds={nodeIdsShown}
                edges={cell.edges}
                heightOfEachRow={heightOfEachEvent}
                nodeIdSelected={eventIdSelected}
                nodeIdDragged={nodeIdDragged}
                onNodeClicked={selectTheEvent}
                onConnected={connect}
                onDisconnected={disconnect}
            />
        );
    }

    function drawTheEvent(
        nodeId: string,
        dragging: AuthorFileEditorReorderableListItemDragging,
    ): ReactNode {
        const plotNode = cell.getNodeById(nodeId);
        // An event the story does not tell yet has no passage.
        const passage =
            passages.find((inTheStory) => inTheStory.passageId === nodeId) ??
            null;
        return (
            <AuthorFileEditorPlotEvent
                story={story}
                plotCellId={cell.uniqueId}
                plotNode={plotNode}
                passage={passage}
                isSelected={nodeId === eventIdSelected}
                storyTextSelected={storyTextSelected}
                onSelected={() => selectTheEvent(nodeId)}
                onDragStarted={dragging.onDragStarted}
                onDragEnded={dragging.onDragEnded}
                sendMessagesToVscode={sendMessagesToVscode}
            />
        );
    }

    return (
        <AuthorFileEditorCell
            actions={
                <AuthorFileEditorStoryAnnotationShownInTheManuscript
                    cellKind={PLOT}
                    annotationCellId={cell.uniqueId}
                    isShown={isShownInTheManuscript}
                />
            }
        >
            <AuthorFileEditorCellHeader>
                Plot
                <AuthorFileEditorCellHeaderTitle title={cell.title} />
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
                        <AuthorFileEditorReorderableList
                            itemIds={nodeIds}
                            onMoved={moveTheNode}
                            drawTheItem={drawTheEvent}
                            drawBesideTheItems={drawTheLanes}
                        />
                    )}
                </AuthorFileEditorCellCard>
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: PLOT,
    menuLabel: "Plot",
    insertMenuGroup: "primary",
});
