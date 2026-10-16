import type {
    StoryFact,
    StoryPlot,
    StoryScene,
} from "../../vscode_runtime/commands/identify_story_plots";
import type { WorkProgress } from "../../vscode_runtime/server/jobs";
import type { SendMessagesToVscode } from "./AuthorshipPanelCanvas";
import { AuthorshipPanelWorkProgress } from "./AuthorshipPanelWorkProgress";
import "./AuthorshipPanelStoryPlots.css";

interface AuthorshipPanelStoryPlotsProps {
    storyScenes: StoryScene[] | null;
    storyPlots: StoryPlot[] | null;
    storyPlotsProgress: WorkProgress | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

function spokenFact(fact: StoryFact): string {
    return `${fact.subject} ${fact.relation} ${fact.object}`;
}

export function AuthorshipPanelStoryPlots({
    storyScenes,
    storyPlots,
    storyPlotsProgress,
    sendMessagesToVscode,
}: AuthorshipPanelStoryPlotsProps) {
    if (storyScenes === null || storyPlots === null) {
        return <div className="authorship-panel-idle">No manuscript open</div>;
    }

    return (
        <>
            <header className="authorship-panel-toolbar">
                <button
                    type="button"
                    className="authorship-panel-toolbar-button"
                    title="Identify the plots the story weaves"
                    aria-label="Identify the plots the story weaves"
                    onClick={() =>
                        sendMessagesToVscode({
                            type: "invoke",
                            commandName: "identifyStoryPlots",
                            commandArguments: {},
                        })
                    }
                >
                    <i className="codicon codicon-play" />
                </button>
            </header>
            <details className="authorship-panel-story-plots-drawer" open>
                <summary>Plots</summary>
                {storyPlots.length === 0 ? (
                    <div className="authorship-panel-idle">
                        No plots identified yet
                    </div>
                ) : (
                    <ul className="authorship-panel-story-plots authorship-panel-swatches">
                        {storyPlots.map((storyPlot, storyPlotIndex) => (
                            <li key={storyPlotIndex}>
                                <details className="authorship-panel-story-plot">
                                    <summary>
                                        <span className="authorship-panel-swatch" />
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
            <details className="authorship-panel-story-plots-drawer" open>
                <summary>Scenes</summary>
                {storyScenes.length === 0 ? (
                    <div className="authorship-panel-idle">
                        No scenes identified yet
                    </div>
                ) : (
                    <ul className="authorship-panel-story-scenes">
                        {storyScenes.map((storyScene, storySceneIndex) => (
                            <li key={storySceneIndex}>
                                <details className="authorship-panel-story-scene">
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
                <details className="authorship-panel-story-plots-drawer" open>
                    <summary>Progress</summary>
                    <AuthorshipPanelWorkProgress
                        progress={storyPlotsProgress}
                    />
                </details>
            )}
        </>
    );
}
