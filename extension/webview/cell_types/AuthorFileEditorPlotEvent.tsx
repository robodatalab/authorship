import {
    AuthorFileEditorCell,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellCard,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellState,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import type { SendMessagesToVscode } from "../author_editor/AuthorFileEditorCanvas";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import {
    AuthorFileEditorCellReferences,
    type AuthorFileEditorCellReferencesWording,
} from "./AuthorFileEditorCellReferences";
import { CharacterCell } from "authordoc/cells/character_cell";
import { PlaceCell } from "authordoc/cells/place_cell";
import type { PlotNode } from "authordoc/cells/plot_cell";
import type { StoryWordRangeInTheStory } from "authordoc/iterators/story_annotations_iterator";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";
import type { Document } from "authordoc/storydoc";
import "./StoryAnnotationCells.css";

const TOLD_BY_NO_WORDS = "Not told in the story yet";
const TAKE_THE_NODE_OUT = "Take this event out of the trajectory";
const ASSIGN_THE_WORDS_SELECTED = "Assign the selected words to this event";
const DELETE_THE_STORY_TEXT = "Delete the story text of this event";
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

interface AuthorFileEditorPlotEventProps {
    story: Document;
    plotCellId: string;
    plotNode: PlotNode;
    passage: StoryWordRangeInTheStory | null;
    isSelected: boolean;
    storyTextSelected: StoryTextSpan | null;
    onSelected: () => void;
    onDragStarted: () => void;
    onDragEnded: () => void;
    sendMessagesToVscode: SendMessagesToVscode;
}

// An event in a plot's trajectory: what it is, when and where it
// happens, and the story text that tells it.
export function AuthorFileEditorPlotEvent({
    story,
    plotCellId,
    plotNode,
    passage,
    isSelected,
    storyTextSelected,
    onSelected,
    onDragStarted,
    onDragEnded,
    sendMessagesToVscode,
}: AuthorFileEditorPlotEventProps) {
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();

    // Only what changed is sent, for the host to say of the event as the plot
    // stands there: the plot this page drew may be behind it.
    function sayOfTheEvent(field: string, said: string): void {
        sendMessagesToVscode({
            type: "invoke",
            commandName: "changePlotEvent",
            commandArguments: {
                annotationCellId: plotCellId,
                nodeId: plotNode.nodeId,
                field,
                said,
            },
        });
    }

    const fields: AuthorFileEditorCellField[] = [
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
                annotationCellId: plotCellId,
                nodeId: plotNode.nodeId,
                characterCellId,
            },
        });
    }

    return (
        <div
            className={
                isSelected
                    ? "author-file-editor-plot-event author-file-editor-plot-event-selected"
                    : "author-file-editor-plot-event"
            }
        >
            <AuthorFileEditorCellState
                cellCommands={[]}
                cellId={plotNode.nodeId}
                cellIsFolded={false}
                timesTheHostWroteIt={timesTheHostWroteIt}
                onDragStarted={onDragStarted}
                onDragEnded={onDragEnded}
                sendMessagesToVscode={sendMessagesToVscode}
            >
                <AuthorFileEditorCell
                    actions={
                        <button
                            type="button"
                            className="author-file-editor-cell-actions-button"
                            title={TAKE_THE_NODE_OUT}
                            aria-label={TAKE_THE_NODE_OUT}
                            onClick={() =>
                                sendMessagesToVscode({
                                    type: "invoke",
                                    commandName: "removeNodeFromPlot",
                                    commandArguments: {
                                        annotationCellId: plotCellId,
                                        nodeId: plotNode.nodeId,
                                    },
                                })
                            }
                        >
                            <i className="codicon codicon-close" />
                        </button>
                    }
                >
                    <AuthorFileEditorCellHeader>Event</AuthorFileEditorCellHeader>
                    <AuthorFileEditorCellBody>
                        <AuthorFileEditorCellCard>
                            <AuthorFileEditorCellFields fields={fields} />
                        </AuthorFileEditorCellCard>
                        <AuthorFileEditorCellCard>
                            <MarkdownEditor
                                cellId={plotNode.nodeId}
                                markdown={plotNode.summary}
                                timesTheHostWroteIt={timesTheHostWroteIt}
                                onMarkdownCommitted={(summary) =>
                                    sayOfTheEvent("summary", summary)
                                }
                            />
                        </AuthorFileEditorCellCard>
                        <AuthorFileEditorCellCard>
                            <AuthorFileEditorCellReferences
                                className="author-file-editor-plot-event-place"
                                referencedCells={placeReferenced}
                                cellsToChoose={placesToChoose}
                                wording={EVENT_PLACE_WORDING}
                                onReferenced={(placeCellId) =>
                                    sayOfTheEvent("place", placeCellId)
                                }
                                onStoppedReferencing={() =>
                                    sayOfTheEvent("place", "")
                                }
                            />
                        </AuthorFileEditorCellCard>
                        <AuthorFileEditorCellCard>
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
                        </AuthorFileEditorCellCard>
                        <AuthorFileEditorCellCard>
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
                                            onClick={() => {
                                                onSelected();
                                                sendMessagesToVscode({
                                                    type: "showStoryWordRange",
                                                    firstWord: passage.firstWord,
                                                    lastWord: passage.lastWord,
                                                });
                                            }}
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
                                                commandName:
                                                    "assignStoryTextToPlotEvent",
                                                commandArguments: {
                                                    annotationCellId: plotCellId,
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
                                                    commandName:
                                                        "removeStoryTextFromPlotEvent",
                                                    commandArguments: {
                                                        annotationCellId:
                                                            plotCellId,
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
                        </AuthorFileEditorCellCard>
                    </AuthorFileEditorCellBody>
                    <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
                </AuthorFileEditorCell>
            </AuthorFileEditorCellState>
        </div>
    );
}
