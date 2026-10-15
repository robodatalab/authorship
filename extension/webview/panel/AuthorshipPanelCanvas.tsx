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
import type {
    SalientConceptInTheStory,
    StoryTextSpan,
} from "../../vscode_runtime/storydoc/story_words";
import "./AuthorshipPanelCanvas.css";

export type SendMessagesToVscode = (message: unknown) => void;

const SERVING_STATUS_TAB = "Serving Status";
const JOBS_STATUS_TAB = "Jobs Status";
const SALIENT_CONCEPTS_TAB = "Salient Concepts";
const AUTHORSHIP_PANEL_TABS = [
    SERVING_STATUS_TAB,
    JOBS_STATUS_TAB,
    SALIENT_CONCEPTS_TAB,
];

interface AuthorshipPanelCanvasProps {
    models?: ModelServingStatus[] | null;
    jobs?: AsyncJobStatus[] | null;
    salientConcepts?: SalientConceptInTheStory[] | null;
    salientConceptSelected?: string | null;
    storyTextSelected?: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelCanvas({
    models,
    jobs,
    salientConcepts,
    salientConceptSelected = null,
    storyTextSelected = null,
    sendMessagesToVscode,
}: AuthorshipPanelCanvasProps) {
    const [tabShown, showTab] = useState(SERVING_STATUS_TAB);

    return (
        <>
            <div className="authorship-panel-tabs" role="tablist">
                {AUTHORSHIP_PANEL_TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        className="authorship-panel-tab"
                        aria-selected={tab === tabShown}
                        onClick={() => showTab(tab)}
                    >
                        {tab}
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
            </div>
        </>
    );
}
