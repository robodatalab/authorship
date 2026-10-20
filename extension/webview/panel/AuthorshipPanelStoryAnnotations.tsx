import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import {
    AuthorFileEditorCellFields,
    type AuthorFileEditorCellField,
} from "../author_editor/AuthorFileEditorCellFields";
import {
    MarkdownEditor,
    MarkdownEditorMediator,
    useTimesTheHostRewroteIt,
} from "../markdown/MarkdownEditor";
import type { StoryAnnotationInTheStory } from "../../library/storydoc/iterators/story_annotations_iterator";
import type { StoryAnnotationSelected } from "../../vscode_runtime/story_annotation_selection";
import type { StoryTextSpan } from "../../library/storydoc/iterators/story_words_iterator";
import "./AuthorshipPanelStoryAnnotations.css";

const ANNOTATION_FIELDS: AuthorFileEditorCellField[] = [
    { attributeName: "title", label: "Title" },
];

export interface AuthorshipPanelStoryAnnotationsWording {
    addAnAnnotation: string;
    noAnnotationsYet: string;
    selectAnAnnotation: string;
    deleteTheAnnotation: string;
    passagesHeading: string;
    passagesCounted: string;
    assignTheWordsSelected: string;
    noPassagesYet: string;
    takeThePassageOut: string;
}

interface AuthorshipPanelStoryAnnotationsProps {
    cellKind: string;
    storyAnnotations: StoryAnnotationInTheStory[] | null;
    storyAnnotationSelected: StoryAnnotationSelected;
    storyTextSelected: StoryTextSpan | null;
    wording: AuthorshipPanelStoryAnnotationsWording;
    listsThePassagesNewestFirst: boolean;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelStoryAnnotations({
    cellKind,
    storyAnnotations,
    storyAnnotationSelected,
    storyTextSelected,
    wording,
    listsThePassagesNewestFirst,
    sendMessagesToVscode,
}: AuthorshipPanelStoryAnnotationsProps) {
    if (storyAnnotations === null) {
        return <div className="authorship-panel-idle">No manuscript open</div>;
    }
    const annotationShown = storyAnnotations.find(
        (annotation) =>
            annotation.annotationCellId ===
            storyAnnotationSelected.annotationCellId,
    );

    return (
        <div className="authorship-panel-story-annotations">
            <header className="authorship-panel-toolbar">
                <button
                    type="button"
                    className="authorship-panel-toolbar-button"
                    title={wording.addAnAnnotation}
                    aria-label={wording.addAnAnnotation}
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "addStoryAnnotation",
                            commandArguments: { cellKind },
                        })
                    }
                >
                    <i className="codicon codicon-add" />
                </button>
            </header>
            {storyAnnotations.length === 0 ? (
                <div className="authorship-panel-idle">
                    {wording.noAnnotationsYet}
                </div>
            ) : (
                <>
                    <ul className="authorship-panel-story-annotations-list authorship-panel-swatches">
                        {storyAnnotations.map((annotation) => (
                            <li
                                key={annotation.annotationCellId}
                                className={
                                    annotation === annotationShown
                                        ? "authorship-panel-story-annotation authorship-panel-story-annotation-selected"
                                        : "authorship-panel-story-annotation"
                                }
                            >
                                <button
                                    type="button"
                                    className="authorship-panel-story-annotation-title"
                                    aria-pressed={annotation === annotationShown}
                                    onClick={() =>
                                        sendMessagesToVscode({
                                            type: "selectStoryAnnotation",
                                            cellKind,
                                            annotationCellId:
                                                annotation === annotationShown
                                                    ? null
                                                    : annotation.annotationCellId,
                                        })
                                    }
                                >
                                    <span className="authorship-panel-swatch" />
                                    {annotation.title}
                                </button>
                                <span
                                    className="authorship-panel-story-annotation-passages-count"
                                    title={wording.passagesCounted}
                                >
                                    {annotation.passages.length}
                                </span>
                                <button
                                    type="button"
                                    className="authorship-panel-story-annotation-deleted"
                                    title={wording.deleteTheAnnotation}
                                    aria-label={wording.deleteTheAnnotation}
                                    onClick={() =>
                                        sendMessagesToVscode({
                                            type: "invoke",
                                            commandName: "deleteStoryAnnotation",
                                            commandArguments: {
                                                annotationCellId:
                                                    annotation.annotationCellId,
                                            },
                                        })
                                    }
                                >
                                    <i className="codicon codicon-trash" />
                                </button>
                            </li>
                        ))}
                    </ul>
                    {annotationShown === undefined ? (
                        <section className="authorship-panel-story-annotation-details">
                            <div className="authorship-panel-idle">
                                {wording.selectAnAnnotation}
                            </div>
                        </section>
                    ) : (
                        <AuthorshipPanelStoryAnnotationDetails
                            key={annotationShown.annotationCellId}
                            cellKind={cellKind}
                            annotation={annotationShown}
                            passageSelected={storyAnnotationSelected.passage}
                            storyTextSelected={storyTextSelected}
                            wording={wording}
                            listsThePassagesNewestFirst={
                                listsThePassagesNewestFirst
                            }
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
                </>
            )}
        </div>
    );
}

interface AuthorshipPanelStoryAnnotationDetailsProps {
    cellKind: string;
    annotation: StoryAnnotationInTheStory;
    passageSelected: number | null;
    storyTextSelected: StoryTextSpan | null;
    wording: AuthorshipPanelStoryAnnotationsWording;
    listsThePassagesNewestFirst: boolean;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorshipPanelStoryAnnotationDetails({
    cellKind,
    annotation,
    passageSelected,
    storyTextSelected,
    wording,
    listsThePassagesNewestFirst,
    sendMessagesToVscode,
}: AuthorshipPanelStoryAnnotationDetailsProps) {
    const description = useTimesTheHostRewroteIt(annotation.description);
    const passagesInTheStory = annotation.passages.map(
        (storyWordRange, passage) => ({ storyWordRange, passage }),
    );
    const passagesListed = listsThePassagesNewestFirst
        ? passagesInTheStory.reverse()
        : passagesInTheStory;

    return (
        <section className="authorship-panel-story-annotation-details">
            <AuthorFileEditorCellFields
                fields={ANNOTATION_FIELDS}
                cellAttributes={{ title: annotation.title }}
                onAttributeChanged={(attributeName, attributeValue) =>
                    sendMessagesToVscode({
                        type: "invoke",
                        commandName: "replaceAttribute",
                        commandArguments: {
                            cellId: annotation.annotationCellId,
                            attributeName,
                            attributeValue,
                        },
                    })
                }
            />
            <div className="authorship-panel-story-annotation-description">
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId={annotation.annotationCellId}
                        markdown={annotation.description}
                        timesTheHostWroteIt={description.timesTheHostRewroteIt}
                        onMarkdownCommitted={(markdown) => {
                            description.theAuthorTyped(markdown);
                            sendMessagesToVscode({
                                type: "typed",
                                cellId: annotation.annotationCellId,
                                markdown,
                            });
                        }}
                    />
                </MarkdownEditorMediator>
            </div>
            <div className="authorship-panel-story-annotation-passages-heading">
                <h4>{wording.passagesHeading}</h4>
                <button
                    type="button"
                    className="authorship-panel-story-annotation-assign"
                    title={wording.assignTheWordsSelected}
                    aria-label={wording.assignTheWordsSelected}
                    disabled={storyTextSelected === null}
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "assignStoryText",
                            commandArguments: {
                                annotationCellId: annotation.annotationCellId,
                                ...storyTextSelected,
                            },
                        })
                    }
                >
                    <i className="codicon codicon-add" />
                </button>
            </div>
            {passagesListed.length === 0 ? (
                <div className="authorship-panel-idle">
                    {wording.noPassagesYet}
                </div>
            ) : (
                <ul className="authorship-panel-story-annotation-passages">
                    {passagesListed.map(({ storyWordRange, passage }) => (
                        <li
                            key={`${storyWordRange.firstWord}-${storyWordRange.lastWord}`}
                            className={
                                passage === passageSelected
                                    ? "authorship-panel-story-annotation-passage authorship-panel-story-annotation-passage-selected"
                                    : "authorship-panel-story-annotation-passage"
                            }
                        >
                            <button
                                type="button"
                                className="authorship-panel-story-annotation-passage-shown"
                                title={storyWordRange.wordsItCovers}
                                aria-pressed={passage === passageSelected}
                                onClick={() => {
                                    sendMessagesToVscode({
                                        type: "selectPassage",
                                        cellKind,
                                        passage,
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
                                title={wording.takeThePassageOut}
                                aria-label={wording.takeThePassageOut}
                                onClick={() =>
                                    sendMessagesToVscode({
                                        type: "invoke",
                                        commandName: "removeStoryWordRange",
                                        commandArguments: {
                                            annotationCellId:
                                                annotation.annotationCellId,
                                            firstWord: storyWordRange.firstWord,
                                            lastWord: storyWordRange.lastWord,
                                        },
                                    })
                                }
                            >
                                <i className="codicon codicon-close" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
