import { useState, type PointerEvent as ReactPointerEvent } from "react";

import type { StoryPlot } from "../../vscode_runtime/commands/identify_story_plots";
import type { WorkProgress } from "../../vscode_runtime/server/jobs";
import { AuthorFileEditorWorkProgress } from "./AuthorFileEditorWorkProgress";
import { storyPlotColorClassName } from "../markdown/MarkdownEditor";
import "./AuthorFileEditorStoryPlots.css";

const NARROWEST = 220;
const WIDEST = 720;

interface AuthorFileEditorStoryPlotsProps {
    storyPlots: StoryPlot[];
    storyPlotsProgress?: WorkProgress | null;
    onIdentifyStoryPlotsAsked: () => void;
}

export function AuthorFileEditorStoryPlots({
    storyPlots,
    storyPlotsProgress = null,
    onIdentifyStoryPlotsAsked,
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
