import type { StoryPlot } from "../../vscode_runtime/commands/identify_story_plots";
import { storyPlotColorClassName } from "../markdown/MarkdownEditor";
import "./AuthorFileEditorStoryPlots.css";

interface AuthorFileEditorStoryPlotsProps {
    storyPlots: StoryPlot[];
    onIdentifyStoryPlotsAsked: () => void;
}

export function AuthorFileEditorStoryPlots({
    storyPlots,
    onIdentifyStoryPlotsAsked,
}: AuthorFileEditorStoryPlotsProps) {
    return (
        <aside className="author-file-editor-story-plots">
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
                                <p>{storyPlot.summary}</p>
                            </details>
                        </li>
                    ))}
                </ul>
            )}
        </aside>
    );
}
