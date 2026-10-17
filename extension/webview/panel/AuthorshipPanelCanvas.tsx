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
import { AuthorshipPanelPlots } from "./AuthorshipPanelPlots";
import type {
    PlotInTheStory,
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
const PLOTS_TAB: AuthorshipPanelTab = {
    label: "Plots",
    iconClassName: "codicon codicon-layers",
};
const AUTHORSHIP_PANEL_TABS = [
    SALIENT_CONCEPTS_TAB,
    PLOTS_TAB,
    JOBS_STATUS_TAB,
    SERVING_STATUS_TAB,
];

interface AuthorshipPanelCanvasProps {
    models?: ModelServingStatus[] | null;
    jobs?: AsyncJobStatus[] | null;
    salientConcepts?: SalientConceptInTheStory[] | null;
    salientConceptSelected?: string | null;
    plots?: PlotInTheStory[] | null;
    plotSelected?: string | null;
    storyTextSelected?: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelCanvas({
    models,
    jobs,
    salientConcepts,
    salientConceptSelected = null,
    plots,
    plotSelected = null,
    storyTextSelected = null,
    sendMessagesToVscode,
}: AuthorshipPanelCanvasProps) {
    const [tabShown, showTab] = useState(SALIENT_CONCEPTS_TAB);

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
                {tabShown === SALIENT_CONCEPTS_TAB &&
                    salientConcepts !== undefined && (
                        <AuthorshipPanelSalientConcepts
                            salientConcepts={salientConcepts}
                            salientConceptSelected={salientConceptSelected}
                            storyTextSelected={storyTextSelected}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
                {tabShown === PLOTS_TAB && plots !== undefined && (
                    <AuthorshipPanelPlots
                        plots={plots}
                        plotSelected={plotSelected}
                        storyTextSelected={storyTextSelected}
                        sendMessagesToVscode={sendMessagesToVscode}
                    />
                )}
                {tabShown === JOBS_STATUS_TAB && jobs !== undefined && (
                    <AuthorshipPanelAsyncJobs
                        jobs={jobs}
                        sendMessagesToVscode={sendMessagesToVscode}
                    />
                )}
                {tabShown === SERVING_STATUS_TAB && models !== undefined && (
                    <AuthorshipPanelServingStatus models={models} />
                )}
            </div>
        </>
    );
}
