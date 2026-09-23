import type {
    StoryPlot,
    StoryPlotsProgress,
} from "../../vscode_runtime/commands/identify_story_plots";
import { storyPlotColorClassName } from "../markdown/MarkdownEditor";
import "./AuthorFileEditorStoryPlots.css";

interface AuthorFileEditorStoryPlotsProps {
    storyPlots: StoryPlot[];
    storyPlotsProgress?: StoryPlotsProgress | null;
    onIdentifyStoryPlotsAsked: () => void;
}

function howFarTheIdentificationGot(progress: StoryPlotsProgress): string {
    if (progress.passes === 0) {
        return "Reading the chapters…";
    }
    return `Pass ${progress.passes} — ${progress.scored} of ${progress.plots} plots read`;
}

export function AuthorFileEditorStoryPlots({
    storyPlots,
    storyPlotsProgress = null,
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
            {storyPlotsProgress && (
                <p className="author-file-editor-story-plots-progress">
                    {howFarTheIdentificationGot(storyPlotsProgress)}
                </p>
            )}
            {storyPlots.length === 0 && !storyPlotsProgress && (
                <p className="author-file-editor-story-plots-none">
                    No plots identified yet.
                </p>
            )}
            {storyPlots.length > 0 && (
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
