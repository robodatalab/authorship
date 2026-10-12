import { useState, type PointerEvent as ReactPointerEvent } from "react";

import type {
    StoryFact,
    StoryPlot,
    StoryScene,
} from "../../vscode_runtime/commands/identify_story_plots";
import type { WorkProgress } from "../../vscode_runtime/server/jobs";
import type {
    SalientConceptInTheStory,
    StoryWordRange,
} from "../../vscode_runtime/storydoc/story_words";
import { AuthorFileEditorWorkProgress } from "./AuthorFileEditorWorkProgress";
import { storyPlotColorClassName } from "../markdown/MarkdownEditor";
import "./AuthorFileEditorStoryPlots.css";

const NARROWEST = 220;
const WIDEST = 720;

interface AuthorFileEditorStoryPlotsProps {
    salientConcepts: SalientConceptInTheStory[];
    salientConceptsShown: ReadonlySet<string>;
    storyTextIsSelected: boolean;
    storyScenes: StoryScene[];
    storyPlots: StoryPlot[];
    storyPlotsProgress?: WorkProgress | null;
    onIdentifyStoryPlotsAsked: () => void;
    onSalientConceptToggled: (conceptCellId: string, isShown: boolean) => void;
    onStoryTextAssigned: (conceptCellId: string) => void;
    onStoryWordRangeShown: (storyWordRange: StoryWordRange) => void;
    onStoryWordRangeRemoved: (
        conceptCellId: string,
        storyWordRange: StoryWordRange,
    ) => void;
}

function spokenFact(fact: StoryFact): string {
    return `${fact.subject} ${fact.relation} ${fact.object}`;
}

export function AuthorFileEditorStoryPlots({
    salientConcepts,
    salientConceptsShown,
    storyTextIsSelected,
    storyScenes,
    storyPlots,
    storyPlotsProgress = null,
    onIdentifyStoryPlotsAsked,
    onSalientConceptToggled,
    onStoryTextAssigned,
    onStoryWordRangeShown,
    onStoryWordRangeRemoved,
}: AuthorFileEditorStoryPlotsProps) {
    const [width, setWidth] = useState(280);

    function dragTheEdge(grabbed: ReactPointerEvent<HTMLDivElement>): void {
        const grabbedAt = grabbed.clientX;
        const wasWide = width;
        function widen(dragged: PointerEvent): void {
            setWidth(
                Math.min(
                    WIDEST,
                    Math.max(NARROWEST, wasWide + grabbedAt - dragged.clientX),
                ),
            );
        }
        function letGo(): void {
            window.removeEventListener("pointermove", widen);
            window.removeEventListener("pointerup", letGo);
        }
        window.addEventListener("pointermove", widen);
        window.addEventListener("pointerup", letGo);
    }

    return (
        <aside
            className="author-file-editor-story-plots"
            style={{ width: `${width}px` }}
        >
            <div
                className="author-file-editor-story-plots-edge"
                onPointerDown={dragTheEdge}
            />
            <header className="author-file-editor-story-plots-header">
                Plots
                <button
                    type="button"
                    className="author-file-editor-story-plots-identify"
                    title="Identify the plots the story weaves"
                    aria-label="Identify the plots the story weaves"
                    onClick={onIdentifyStoryPlotsAsked}
                >
                    <i className="codicon codicon-play" />
                </button>
            </header>
            <details className="author-file-editor-story-plots-drawer" open>
                <summary>Salient concepts</summary>
                {salientConcepts.length === 0 ? (
                    <p className="author-file-editor-story-plots-none">
                        No salient concepts yet.
                    </p>
                ) : (
                    <ul>
                        {salientConcepts.map((concept, conceptIndex) => (
                            <li key={concept.conceptCellId}>
                                <details
                                    className="author-file-editor-salient-concept"
                                    open={salientConceptsShown.has(
                                        concept.conceptCellId,
                                    )}
                                    onToggle={(toggled) =>
                                        onSalientConceptToggled(
                                            concept.conceptCellId,
                                            toggled.currentTarget.open,
                                        )
                                    }
                                >
                                    <summary>
                                        <span
                                            className={`author-file-editor-story-plot-swatch ${storyPlotColorClassName(conceptIndex)}`}
                                        />
                                        {concept.title}
                                        <button
                                            type="button"
                                            className="author-file-editor-salient-concept-assign"
                                            title="Assign the selected words to this concept"
                                            aria-label="Assign the selected words to this concept"
                                            disabled={!storyTextIsSelected}
                                            onMouseDown={(pressed) =>
                                                pressed.preventDefault()
                                            }
                                            onClick={(clicked) => {
                                                clicked.preventDefault();
                                                onStoryTextAssigned(
                                                    concept.conceptCellId,
                                                );
                                            }}
                                        >
                                            <i className="codicon codicon-add" />
                                        </button>
                                    </summary>
                                    {concept.storyWordRanges.length === 0 ? (
                                        <p className="author-file-editor-story-plots-none">
                                            No words assigned yet.
                                        </p>
                                    ) : (
                                        <ul>
                                            {concept.storyWordRanges.map(
                                                (storyWordRange) => (
                                                    <li
                                                        key={`${storyWordRange.firstWord}-${storyWordRange.lastWord}`}
                                                        className="author-file-editor-salient-concept-words"
                                                    >
                                                        <button
                                                            type="button"
                                                            className="author-file-editor-salient-concept-words-shown"
                                                            title={
                                                                storyWordRange.wordsItCovers
                                                            }
                                                            onClick={() =>
                                                                onStoryWordRangeShown(
                                                                    storyWordRange,
                                                                )
                                                            }
                                                        >
                                                            {
                                                                storyWordRange.wordsItCovers
                                                            }
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="author-file-editor-salient-concept-words-removed"
                                                            title="Take these words out of the concept"
                                                            aria-label="Take these words out of the concept"
                                                            onClick={() =>
                                                                onStoryWordRangeRemoved(
                                                                    concept.conceptCellId,
                                                                    storyWordRange,
                                                                )
                                                            }
                                                        >
                                                            <i className="codicon codicon-close" />
                                                        </button>
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    )}
                                </details>
                            </li>
                        ))}
                    </ul>
                )}
            </details>
            <details className="author-file-editor-story-plots-drawer" open>
                <summary>Plots</summary>
                {storyPlots.length === 0 ? (
                    <p className="author-file-editor-story-plots-none">
                        No plots identified yet.
                    </p>
                ) : (
                    <ul>
                        {storyPlots.map((storyPlot, storyPlotIndex) => (
                            <li key={storyPlotIndex}>
                                <details className="author-file-editor-story-plot">
                                    <summary>
                                        <span
                                            className={`author-file-editor-story-plot-swatch ${storyPlotColorClassName(storyPlotIndex)}`}
                                        />
                                        {storyPlot.title}
                                    </summary>
                                    <dl>
                                        <dt>Who</dt>
                                        <dd>
                                            {storyPlot.characters.join(", ")}
                                        </dd>
                                        <dt>Began</dt>
                                        <dd>{storyPlot.origin}</dd>
                                        <dt>Heading for</dt>
                                        <dd>{storyPlot.goal}</dd>
                                        <dt>So far</dt>
                                        <dd>
                                            {storyPlot.keyEvents.length ===
                                            0 ? (
                                                "nothing recorded yet"
                                            ) : (
                                                <ul>
                                                    {storyPlot.keyEvents.map(
                                                        (happened, when) => (
                                                            <li key={when}>
                                                                {happened}
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            )}
                                        </dd>
                                    </dl>
                                </details>
                            </li>
                        ))}
                    </ul>
                )}
            </details>
            <details className="author-file-editor-story-plots-drawer" open>
                <summary>Scenes</summary>
                {storyScenes.length === 0 ? (
                    <p className="author-file-editor-story-plots-none">
                        No scenes identified yet.
                    </p>
                ) : (
                    <ul>
                        {storyScenes.map((storyScene, storySceneIndex) => (
                            <li key={storySceneIndex}>
                                <details className="author-file-editor-story-scene">
                                    <summary>
                                        Lines {storyScene.firstLine + 1}–
                                        {storyScene.lastLine + 1}:{" "}
                                        {storyScene.openingLine}
                                    </summary>
                                    <dl>
                                        <dt>Holds</dt>
                                        <dd>
                                            <ul>
                                                {storyScene.storyState.madeTrue.map(
                                                    (fact, factIndex) => (
                                                        <li key={factIndex}>
                                                            {spokenFact(fact)}
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </dd>
                                        <dt>No longer holds</dt>
                                        <dd>
                                            <ul>
                                                {storyScene.storyState.madeFalse.map(
                                                    (fact, factIndex) => (
                                                        <li key={factIndex}>
                                                            {spokenFact(fact)}
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </dd>
                                    </dl>
                                </details>
                            </li>
                        ))}
                    </ul>
                )}
            </details>
            {storyPlotsProgress && (
                <details className="author-file-editor-story-plots-drawer" open>
                    <summary>Progress</summary>
                    <AuthorFileEditorWorkProgress
                        progress={storyPlotsProgress}
                    />
                </details>
            )}
        </aside>
    );
}
