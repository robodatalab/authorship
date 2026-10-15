import { useState, type ChangeEvent } from "react";
import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import type {
    SalientConceptInTheStory,
    StoryTextSpan,
} from "../../vscode_runtime/storydoc/story_words";
import "./AuthorshipPanelSalientConcepts.css";

interface AuthorshipPanelSalientConceptsProps {
    salientConcepts: SalientConceptInTheStory[] | null;
    salientConceptSelected: string | null;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelSalientConcepts({
    salientConcepts,
    salientConceptSelected,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorshipPanelSalientConceptsProps) {
    if (salientConcepts === null) {
        return <div className="authorship-panel-idle">No manuscript open</div>;
    }
    if (salientConcepts.length === 0) {
        return (
            <div className="authorship-panel-idle">No salient concepts yet</div>
        );
    }

    const conceptSelected = salientConcepts.find(
        (concept) => concept.conceptCellId === salientConceptSelected,
    );

    return (
        <div className="authorship-panel-salient-concepts">
            <ul className="authorship-panel-salient-concepts-list authorship-panel-swatches">
                {salientConcepts.map((concept) => (
                    <li
                        key={concept.conceptCellId}
                        className={
                            concept === conceptSelected
                                ? "authorship-panel-salient-concept authorship-panel-salient-concept-selected"
                                : "authorship-panel-salient-concept"
                        }
                    >
                        <button
                            type="button"
                            className="authorship-panel-salient-concept-title"
                            aria-pressed={concept === conceptSelected}
                            onClick={() =>
                                sendMessagesToVscode({
                                    type: "selectSalientConcept",
                                    conceptCellId:
                                        concept === conceptSelected
                                            ? null
                                            : concept.conceptCellId,
                                })
                            }
                        >
                            <span className="authorship-panel-swatch" />
                            {concept.title}
                        </button>
                        <button
                            type="button"
                            className="authorship-panel-salient-concept-assign"
                            title="Assign the selected words to this concept"
                            aria-label="Assign the selected words to this concept"
                            disabled={storyTextSelected === null}
                            onClick={() =>
                                sendMessagesToVscode({
                                    type: "invoke",
                                    commandName: "assignStoryText",
                                    commandArguments: {
                                        conceptCellId: concept.conceptCellId,
                                        ...storyTextSelected,
                                    },
                                })
                            }
                        >
                            <i className="codicon codicon-add" />
                        </button>
                    </li>
                ))}
            </ul>
            {conceptSelected === undefined ? (
                <section className="authorship-panel-salient-concept-details">
                    <div className="authorship-panel-idle">
                        Select a concept to see its description and examples
                    </div>
                </section>
            ) : (
                <AuthorshipPanelSalientConceptDetails
                    key={conceptSelected.conceptCellId}
                    concept={conceptSelected}
                    sendMessagesToVscode={sendMessagesToVscode}
                />
            )}
        </div>
    );
}

interface AuthorshipPanelSalientConceptDetailsProps {
    concept: SalientConceptInTheStory;
    sendMessagesToVscode: SendMessagesToVscode;
}

function useTextTheAuthorIsTyping(
    said: string,
    onSaid: (said: string) => void,
) {
    const [beingTyped, setBeingTyped] = useState<string | null>(null);
    return {
        value: beingTyped ?? said,
        onFocus: () => setBeingTyped(said),
        onBlur: () => setBeingTyped(null),
        onChange: (
            typed: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
        ) => {
            setBeingTyped(typed.currentTarget.value);
            onSaid(typed.currentTarget.value);
        },
    };
}

function AuthorshipPanelSalientConceptDetails({
    concept,
    sendMessagesToVscode,
}: AuthorshipPanelSalientConceptDetailsProps) {
    const title = useTextTheAuthorIsTyping(concept.title, (said) =>
        sendMessagesToVscode({
            type: "invoke",
            commandName: "replaceAttribute",
            commandArguments: {
                cellId: concept.conceptCellId,
                attributeName: "title",
                attributeValue: said,
            },
        }),
    );
    const description = useTextTheAuthorIsTyping(concept.description, (said) =>
        sendMessagesToVscode({
            type: "typed",
            cellId: concept.conceptCellId,
            markdown: said,
        }),
    );

    return (
        <section className="authorship-panel-salient-concept-details">
            <div className="authorship-panel-salient-concept-heading">
                <input
                    type="text"
                    className="authorship-panel-salient-concept-title-box"
                    aria-label="Title"
                    placeholder="Title"
                    {...title}
                />
                <button
                    type="button"
                    className="authorship-panel-salient-concept-deleted"
                    title="Delete this concept"
                    aria-label="Delete this concept"
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "deleteCell",
                            commandArguments: {
                                cellId: concept.conceptCellId,
                            },
                        })
                    }
                >
                    <i className="codicon codicon-trash" />
                </button>
            </div>
            <textarea
                className="authorship-panel-salient-concept-description"
                aria-label="Description"
                placeholder="Description"
                rows={4}
                {...description}
            />
            <h4>Examples</h4>
            {concept.storyWordRanges.length === 0 ? (
                <div className="authorship-panel-idle">No words assigned yet</div>
            ) : (
                <ul className="authorship-panel-salient-concept-examples">
                    {concept.storyWordRanges.map((storyWordRange) => (
                        <li
                            key={`${storyWordRange.firstWord}-${storyWordRange.lastWord}`}
                            className="authorship-panel-salient-concept-example"
                        >
                            <button
                                type="button"
                                className="authorship-panel-salient-concept-example-shown"
                                title={storyWordRange.wordsItCovers}
                                onClick={() =>
                                    sendMessagesToVscode({
                                        type: "showStoryWordRange",
                                        firstWord: storyWordRange.firstWord,
                                        lastWord: storyWordRange.lastWord,
                                    })
                                }
                            >
                                {storyWordRange.wordsItCovers}
                            </button>
                            <button
                                type="button"
                                className="authorship-panel-salient-concept-example-removed"
                                title="Take these words out of the concept"
                                aria-label="Take these words out of the concept"
                                onClick={() =>
                                    sendMessagesToVscode({
                                        type: "invoke",
                                        commandName: "removeStoryWordRange",
                                        commandArguments: {
                                            conceptCellId:
                                                concept.conceptCellId,
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
