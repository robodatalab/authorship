import { useEffect, useRef, useState } from "react";
import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import {
    MarkdownEditor,
    MarkdownEditorMediator,
} from "../markdown/MarkdownEditor";
import { fieldsOfCellKind } from "../../vscode_runtime/storydoc/cell_kinds";
import { SALIENT_CONCEPT } from "../../vscode_runtime/storydoc/model";
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
    const conceptSelected = salientConcepts.find(
        (concept) => concept.conceptCellId === salientConceptSelected,
    );

    return (
        <div className="authorship-panel-salient-concepts">
            <header className="authorship-panel-toolbar">
                <button
                    type="button"
                    className="authorship-panel-toolbar-button"
                    title="Add a salient concept"
                    aria-label="Add a salient concept"
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "addSalientConcept",
                            commandArguments: {},
                        })
                    }
                >
                    <i className="codicon codicon-add" />
                </button>
            </header>
            {salientConcepts.length === 0 ? (
                <div className="authorship-panel-idle">
                    No salient concepts yet
                </div>
            ) : (
                <>
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
                                <span
                                    className="authorship-panel-salient-concept-examples-count"
                                    title="Examples"
                                >
                                    {concept.storyWordRanges.length}
                                </span>
                                <button
                                    type="button"
                                    className="authorship-panel-salient-concept-deleted"
                                    title="Delete this concept"
                                    aria-label="Delete this concept"
                                    onClick={() =>
                                        sendMessagesToVscode({
                                            type: "invoke",
                                            commandName: "deleteSalientConcept",
                                            commandArguments: {
                                                conceptCellId: concept.conceptCellId,
                                            },
                                        })
                                    }
                                >
                                    <i className="codicon codicon-trash" />
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
                            storyTextSelected={storyTextSelected}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
                </>
            )}
        </div>
    );
}

interface AuthorshipPanelSalientConceptDetailsProps {
    concept: SalientConceptInTheStory;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

function useTimesTheHostRewroteIt(markdown: string): {
    timesTheHostRewroteIt: number;
    theAuthorTyped: (markdown: string) => void;
} {
    const typedAndNotYetEchoed = useRef<string[]>([]);
    const [timesTheHostRewroteIt, countAHostRewrite] = useState(0);

    useEffect(() => {
        const echoed = typedAndNotYetEchoed.current.indexOf(markdown);
        if (echoed >= 0) {
            typedAndNotYetEchoed.current.splice(0, echoed + 1);
            return;
        }
        typedAndNotYetEchoed.current = [];
        countAHostRewrite((times) => times + 1);
    }, [markdown]);

    return {
        timesTheHostRewroteIt,
        theAuthorTyped: (typed) => typedAndNotYetEchoed.current.push(typed),
    };
}

function AuthorshipPanelSalientConceptDetails({
    concept,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorshipPanelSalientConceptDetailsProps) {
    const description = useTimesTheHostRewroteIt(concept.description);
    const examplesNewestFirst = [...concept.storyWordRanges].reverse();

    return (
        <section className="authorship-panel-salient-concept-details">
            <AuthorFileEditorCellFields
                fields={fieldsOfCellKind(SALIENT_CONCEPT)}
                cellAttributes={{ title: concept.title }}
                onAttributeChanged={(attributeName, attributeValue) =>
                    sendMessagesToVscode({
                        type: "invoke",
                        commandName: "replaceAttribute",
                        commandArguments: {
                            cellId: concept.conceptCellId,
                            attributeName,
                            attributeValue,
                        },
                    })
                }
            />
            <div className="authorship-panel-salient-concept-description">
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <MarkdownEditor
                        cellId={concept.conceptCellId}
                        markdown={concept.description}
                        timesTheHostWroteIt={description.timesTheHostRewroteIt}
                        onMarkdownCommitted={(markdown) => {
                            description.theAuthorTyped(markdown);
                            sendMessagesToVscode({
                                type: "typed",
                                cellId: concept.conceptCellId,
                                markdown,
                            });
                        }}
                    />
                </MarkdownEditorMediator>
            </div>
            <div className="authorship-panel-salient-concept-examples-heading">
                <h4>Examples</h4>
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
            </div>
            {examplesNewestFirst.length === 0 ? (
                <div className="authorship-panel-idle">No words assigned yet</div>
            ) : (
                <ul className="authorship-panel-salient-concept-examples">
                    {examplesNewestFirst.map((storyWordRange) => (
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
