import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import type { StoryAnnotationInTheStory } from "authordoc/iterators/story_annotations_iterator";
import "./AuthorshipPanelStoryAnnotations.css";

const UNTITLED = "Untitled";

const ADD_A_STORY_ANNOTATION = "addStoryAnnotation";

export interface AuthorshipPanelStoryAnnotationsListWording {
    addAnAnnotation: string;
    noAnnotationsYet: string;
    deleteTheAnnotation: string;
    passagesCounted: string;
}

interface AuthorshipPanelStoryAnnotationsListProps {
    cellKind: string;
    storyAnnotations: readonly StoryAnnotationInTheStory[];
    annotationShown: StoryAnnotationInTheStory | undefined;
    wording: AuthorshipPanelStoryAnnotationsListWording;
    // The command whose button the story generation highlights, for the author
    // to press.
    commandHighlighted?: string | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelStoryAnnotationsList({
    cellKind,
    storyAnnotations,
    annotationShown,
    wording,
    commandHighlighted = null,
    sendMessagesToVscode,
}: AuthorshipPanelStoryAnnotationsListProps) {
    return (
        <>
            <header className="authorship-panel-toolbar">
                <button
                    type="button"
                    className={
                        commandHighlighted === ADD_A_STORY_ANNOTATION
                            ? "authorship-panel-toolbar-button authorship-panel-toolbar-button-highlighted"
                            : "authorship-panel-toolbar-button"
                    }
                    title={wording.addAnAnnotation}
                    aria-label={wording.addAnAnnotation}
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: ADD_A_STORY_ANNOTATION,
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
                                {annotation.title || UNTITLED}
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
            )}
        </>
    );
}
