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
            <ul className="authorship-panel-salient-concepts-list">
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
                            <span className="authorship-panel-salient-concept-swatch" />
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
            <section className="authorship-panel-salient-concept-details">
                {conceptSelected === undefined ? (
                    <div className="authorship-panel-idle">
                        Select a concept to see its description and examples
                    </div>
                ) : (
                    <>
                        <h3>{conceptSelected.title}</h3>
                        <p className="authorship-panel-salient-concept-description">
                            {conceptSelected.description}
                        </p>
                        <h4>Examples</h4>
                        {conceptSelected.storyWordRanges.length === 0 ? (
                            <div className="authorship-panel-idle">
                                No words assigned yet
                            </div>
                        ) : (
                            <ul className="authorship-panel-salient-concept-examples">
                                {conceptSelected.storyWordRanges.map(
                                    (storyWordRange) => (
                                        <li
                                            key={`${storyWordRange.firstWord}-${storyWordRange.lastWord}`}
                                            className="authorship-panel-salient-concept-example"
                                        >
                                            <button
                                                type="button"
                                                className="authorship-panel-salient-concept-example-shown"
                                                title={
                                                    storyWordRange.wordsItCovers
                                                }
                                                onClick={() =>
                                                    sendMessagesToVscode({
                                                        type: "showStoryWordRange",
                                                        firstWord:
                                                            storyWordRange.firstWord,
                                                        lastWord:
                                                            storyWordRange.lastWord,
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
                                                        commandName:
                                                            "removeStoryWordRange",
                                                        commandArguments: {
                                                            conceptCellId:
                                                                conceptSelected.conceptCellId,
                                                            firstWord:
                                                                storyWordRange.firstWord,
                                                            lastWord:
                                                                storyWordRange.lastWord,
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
                    </>
                )}
            </section>
        </div>
    );
}
