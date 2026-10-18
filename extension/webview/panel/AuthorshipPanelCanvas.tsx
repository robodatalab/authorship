import { useState } from "react";
import {
    AuthorshipPanelServingStatus,
    type ModelServingStatus,
} from "./AuthorshipPanelServingStatus";
import {
    AuthorshipPanelAsyncJobs,
    type AsyncJobStatus,
} from "./AuthorshipPanelAsyncJobs";
import {
    AuthorshipPanelStoryAnnotations,
    type AuthorshipPanelStoryAnnotationsWording,
} from "./AuthorshipPanelStoryAnnotations";
import { PLOT, SALIENT_CONCEPT } from "../../vscode_runtime/storydoc/model";
import {
    NO_STORY_ANNOTATION_SELECTED,
    type StoryAnnotationInTheStory,
    type StoryAnnotationSelected,
    type StoryTextSpan,
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
const SALIENT_CONCEPTS_WORDING: AuthorshipPanelStoryAnnotationsWording = {
    addAnAnnotation: "Add a salient concept",
    noAnnotationsYet: "No salient concepts yet",
    selectAnAnnotation: "Select a concept to see its description and examples",
    deleteTheAnnotation: "Delete this concept",
    passagesHeading: "Examples",
    passagesCounted: "Examples",
    assignTheWordsSelected: "Assign the selected words to this concept",
    noPassagesYet: "No words assigned yet",
    takeThePassageOut: "Take these words out of the concept",
};
const PLOTS_WORDING: AuthorshipPanelStoryAnnotationsWording = {
    addAnAnnotation: "Add a plot",
    noAnnotationsYet: "No plots yet",
    selectAnAnnotation: "Select a plot to see its abstract and trajectory",
    deleteTheAnnotation: "Delete this plot",
    passagesHeading: "Trajectory",
    passagesCounted: "Spans",
    assignTheWordsSelected: "Add the selected words to the trajectory",
    noPassagesYet: "No words in the trajectory yet",
    takeThePassageOut: "Take these words out of the trajectory",
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
    storyAnnotations?: Record<string, StoryAnnotationInTheStory[]> | null;
    storyAnnotationsSelected?: Record<string, StoryAnnotationSelected>;
    storyTextSelected?: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorshipPanelCanvas({
    models,
    jobs,
    storyAnnotations,
    storyAnnotationsSelected = {},
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
                    storyAnnotations !== undefined && (
                        <AuthorshipPanelStoryAnnotations
                            cellKind={SALIENT_CONCEPT}
                            storyAnnotations={
                                storyAnnotations &&
                                (storyAnnotations[SALIENT_CONCEPT] ?? [])
                            }
                            storyAnnotationSelected={
                                storyAnnotationsSelected[SALIENT_CONCEPT] ??
                                NO_STORY_ANNOTATION_SELECTED
                            }
                            storyTextSelected={storyTextSelected}
                            wording={SALIENT_CONCEPTS_WORDING}
                            listsThePassagesNewestFirst={true}
                            sendMessagesToVscode={sendMessagesToVscode}
                        />
                    )}
                {tabShown === PLOTS_TAB && storyAnnotations !== undefined && (
                    <AuthorshipPanelStoryAnnotations
                        cellKind={PLOT}
                        storyAnnotations={
                            storyAnnotations && (storyAnnotations[PLOT] ?? [])
                        }
                        storyAnnotationSelected={
                            storyAnnotationsSelected[PLOT] ??
                            NO_STORY_ANNOTATION_SELECTED
                        }
                        storyTextSelected={storyTextSelected}
                        wording={PLOTS_WORDING}
                        listsThePassagesNewestFirst={false}
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
