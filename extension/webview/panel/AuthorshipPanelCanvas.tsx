import { useState } from "react";
import {
    AuthorshipPanelServingStatus,
    type ModelServingStatus,
} from "./AuthorshipPanelServingStatus";
import {
    AuthorshipPanelAsyncJobs,
    type AsyncJobStatus,
} from "./AuthorshipPanelAsyncJobs";
import { AuthorshipPanelSalientConcepts } from "./AuthorshipPanelSalientConcepts";
import { AuthorshipPanelStoryPlots } from "./AuthorshipPanelStoryPlots";
import type {
    StoryPlot,
    StoryScene,
} from "../../vscode_runtime/commands/identify_story_plots";
import type { WorkProgress } from "../../vscode_runtime/server/jobs";
import type {
    SalientConceptInTheStory,
    StoryTextSpan,
} from "../../vscode_runtime/storydoc/story_words";
import "./AuthorshipPanelCanvas.css";

export type SendMessagesToVscode = (message: unknown) => void;

interface AuthorshipPanelTab {
    label: string;
    iconClassName: string;
}

const SERVING_STATUS_TAB: AuthorshipPanelTab = {
    label: "Serving Status",
    iconClassName: "codicon codicon-server-process",
};
const JOBS_STATUS_TAB: AuthorshipPanelTab = {
    label: "Jobs Status",
    iconClassName: "codicon codicon-tasklist",
};
const SALIENT_CONCEPTS_TAB: AuthorshipPanelTab = {
    label: "Salient Concepts",
    iconClassName: "codicon codicon-tag",
};
const STORY_PLOTS_TAB: AuthorshipPanelTab = {
    label: "Plots",
    iconClassName: "codicon codicon-layers",
};
const AUTHORSHIP_PANEL_TABS = [
    SERVING_STATUS_TAB,
    JOBS_STATUS_TAB,
    SALIENT_CONCEPTS_TAB,
    STORY_PLOTS_TAB,
];

interface AuthorshipPanelCanvasProps {
    models?: ModelServingStatus[] | null;
    jobs?: AsyncJobStatus[] | null;
    salientConcepts?: SalientConceptInTheStory[] | null;
    salientConceptSelected?: string | null;
    storyTextSelected?: StoryTextSpan | null;
    storyScenes?: StoryScene[] | null;
    storyPlots?: StoryPlot[] | null;
    storyPlotsProgress?: WorkProgress | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelCanvas({
    models,
    jobs,
    salientConcepts,
    salientConceptSelected = null,
    storyTextSelected = null,
    storyScenes,
    storyPlots,
    storyPlotsProgress = null,
    sendMessagesToVscode,
}: AuthorshipPanelCanvasProps) {
    const [tabShown, showTab] = useState(SERVING_STATUS_TAB);

    return (
        <>
            <div className="authorship-panel-tabs" role="tablist">
                {AUTHORSHIP_PANEL_TABS.map((tab) => (
                    <button
                        key={tab.label}
                        type="button"
                        role="tab"
                        className="authorship-panel-tab"
                        title={tab.label}
                        aria-label={tab.label}
                        aria-selected={tab === tabShown}
                        onClick={() => showTab(tab)}
                    >
                        <i className={tab.iconClassName} />
                    </button>
                ))}
            </div>
            <div className="authorship-panel-tab-body" role="tabpanel">
                {tabShown === SERVING_STATUS_TAB && models !== undefined && (
                    <AuthorshipPanelServingStatus models={models} />
                )}
                {tabShown === JOBS_STATUS_TAB && jobs !== undefined && (
                    <AuthorshipPanelAsyncJobs
                        jobs={jobs}
                        sendMessagesToVscode={sendMessagesToVscode}
                    />
                )}
                {tabShown === SALIENT_CONCEPTS_TAB &&
                    salientConcepts !== undefined && (
                        <AuthorshipPanelSalientConcepts
                            salientConcepts={salientConcepts}
                            salientConceptSelected={salientConceptSelected}
                            storyTextSelected={storyTextSelected}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
                {tabShown === STORY_PLOTS_TAB &&
                    storyScenes !== undefined &&
                    storyPlots !== undefined && (
                        <AuthorshipPanelStoryPlots
                            storyScenes={storyScenes}
                            storyPlots={storyPlots}
                            storyPlotsProgress={storyPlotsProgress}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
            </div>
        </>
    );
}
