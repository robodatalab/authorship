import { useMemo } from "react";
import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import {
    AuthorshipPanelStoryAnnotationsList,
    type AuthorshipPanelStoryAnnotationsListWording,
} from "./AuthorshipPanelStoryAnnotationsList";
import { AuthorshipPanelStoryAnnotationTitleAndDescription } from "./AuthorshipPanelStoryAnnotationTitleAndDescription";
import { StoryAnnotationRetitled } from "./StoryAnnotationRetitled";
import { replaceTheCell } from "../author_editor/AuthorFileEditorCanvas";
import {
    StoryAnnotationsIterator,
    type StoryAnnotationInTheStory,
} from "../../library/storydoc/iterators/story_annotations_iterator";
import { SALIENT_CONCEPT } from "../../library/storydoc/cells/salient_concept_cell";
import type { StoryAnnotationSelected } from "../../vscode_runtime/story_annotation_selection";
import type { StoryTextSpan } from "../../library/storydoc/iterators/story_words_iterator";
import type { Cell } from "../../library/storydoc/cells/cell";
import type { Document } from "../../library/storydoc/storydoc";
import "./AuthorshipPanelStoryAnnotations.css";

const SALIENT_CONCEPTS_LIST_WORDING: AuthorshipPanelStoryAnnotationsListWording =
    {
        addAnAnnotation: "Add a salient concept",
        noAnnotationsYet: "No salient concepts yet",
        deleteTheAnnotation: "Delete this concept",
        passagesCounted: "Examples",
    };
const ASSIGN_THE_WORDS_SELECTED = "Assign the selected words to this concept";
const TAKE_THE_REFERENCE_OUT = "Take these words out of the concept";

interface AuthorshipPanelSalientConceptsProps {
    story: Document | null;
    storyAnnotationSelected: StoryAnnotationSelected;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelSalientConcepts({
    story,
    storyAnnotationSelected,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorshipPanelSalientConceptsProps) {
    const salientConcepts = useMemo(() => {
        if (story === null) {
            return null;
        }
        const salientConceptsInTheStory = new StoryAnnotationsIterator(
            story,
            SALIENT_CONCEPT,
        );
        return Array.from(salientConceptsInTheStory);
    }, [story]);
    if (story === null || salientConcepts === null) {
        return <div className="authorship-panel-idle">No manuscript open</div>;
    }
    const salientConceptShown = salientConcepts.find(
        (salientConcept) =>
            salientConcept.annotationCellId ===
            storyAnnotationSelected.annotationCellId,
    );

    function retitleTheSalientConcept(
        salientConceptCellId: string,
        title: string,
    ): void {
        const salientConceptCell = story?.cellWithId(salientConceptCellId);
        if (salientConceptCell === undefined) {
            return;
        }
        const retitling = new StoryAnnotationRetitled(title);
        const retitled = salientConceptCell.accept<Cell>(retitling);
        replaceTheCell(sendMessagesToVscode, retitled);
    }

    return (
        <div className="authorship-panel-story-annotations">
            <AuthorshipPanelStoryAnnotationsList
                cellKind={SALIENT_CONCEPT}
                storyAnnotations={salientConcepts}
                annotationShown={salientConceptShown}
                wording={SALIENT_CONCEPTS_LIST_WORDING}
                sendMessagesToVscode={sendMessagesToVscode}
            />
            {salientConcepts.length > 0 &&
                (salientConceptShown === undefined ? (
                    <section className="authorship-panel-story-annotation-details">
                        <div className="authorship-panel-idle">
                            Select a concept to see its description and
                            examples
                        </div>
                    </section>
                ) : (
                    <AuthorshipPanelSalientConcept
                        key={salientConceptShown.annotationCellId}
                        salientConcept={salientConceptShown}
                        referenceSelected={storyAnnotationSelected.passage}
                        storyTextSelected={storyTextSelected}
                        onRetitled={(title) =>
                            retitleTheSalientConcept(
                                salientConceptShown.annotationCellId,
                                title,
                            )
                        }
                        sendMessagesToVscode={sendMessagesToVscode}
                    />
                ))}
        </div>
    );
}

interface AuthorshipPanelSalientConceptProps {
    salientConcept: StoryAnnotationInTheStory;
    referenceSelected: number | null;
    storyTextSelected: StoryTextSpan | null;
    onRetitled: (title: string) => void;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorshipPanelSalientConcept({
    salientConcept,
    referenceSelected,
    storyTextSelected,
    onRetitled,
    sendMessagesToVscode,
}: AuthorshipPanelSalientConceptProps) {
    const referencesInTheStory = salientConcept.passages.map(
        (storyWordRange, reference) => ({ storyWordRange, reference }),
    );
    const referencesNewestFirst = referencesInTheStory.reverse();

    return (
        <section className="authorship-panel-story-annotation-details">
            <AuthorshipPanelStoryAnnotationTitleAndDescription
                annotationCellId={salientConcept.annotationCellId}
                title={salientConcept.title}
                description={salientConcept.description}
                onRetitled={onRetitled}
                sendMessagesToVscode={sendMessagesToVscode}
            />
            <div className="authorship-panel-story-annotation-passages-heading">
                <h4>Examples</h4>
                <button
                    type="button"
                    className="authorship-panel-story-annotation-assign"
                    title={ASSIGN_THE_WORDS_SELECTED}
                    aria-label={ASSIGN_THE_WORDS_SELECTED}
                    disabled={storyTextSelected === null}
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "assignStoryTextToSalientConcept",
                            commandArguments: {
                                annotationCellId:
                                    salientConcept.annotationCellId,
                                ...storyTextSelected,
                            },
                        })
                    }
                >
                    <i className="codicon codicon-add" />
                </button>
            </div>
            {referencesNewestFirst.length === 0 ? (
                <div className="authorship-panel-idle">
                    No words assigned yet
                </div>
            ) : (
                <ul className="authorship-panel-story-annotation-passages">
                    {referencesNewestFirst.map(
                        ({ storyWordRange, reference }) => (
                            <li
                                key={`${storyWordRange.firstWord}-${storyWordRange.lastWord}`}
                                className={
                                    reference === referenceSelected
                                        ? "authorship-panel-story-annotation-passage authorship-panel-story-annotation-passage-selected"
                                        : "authorship-panel-story-annotation-passage"
                                }
                            >
                                <button
                                    type="button"
                                    className="authorship-panel-story-annotation-passage-shown"
                                    title={storyWordRange.wordsItCovers}
                                    aria-pressed={reference === referenceSelected}
                                    onClick={() => {
                                        sendMessagesToVscode({
                                            type: "selectPassage",
                                            cellKind: SALIENT_CONCEPT,
                                            passage: reference,
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
                                    title={TAKE_THE_REFERENCE_OUT}
                                    aria-label={TAKE_THE_REFERENCE_OUT}
                                    onClick={() =>
                                        sendMessagesToVscode({
                                            type: "invoke",
                                            commandName: "removeStoryWordRange",
                                            commandArguments: {
                                                annotationCellId:
                                                    salientConcept.annotationCellId,
                                                firstWord:
                                                    storyWordRange.firstWord,
                                                lastWord: storyWordRange.lastWord,
                                            },
                                        })
                                    }
                                >
                                    <i className="codicon codicon-close" />
                                </button>
                            </li>
                        ),
                    )}
                </ul>
            )}
        </section>
    );
}
