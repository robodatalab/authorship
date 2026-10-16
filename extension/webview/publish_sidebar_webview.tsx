import { createRoot } from "react-dom/client";
import {
    AuthorshipPanelCanvas,
    type SendMessagesToVscode,
} from "./panel/AuthorshipPanelCanvas";
import type { ModelServingStatus } from "./panel/AuthorshipPanelServingStatus";
import type { AsyncJobStatus } from "./panel/AuthorshipPanelAsyncJobs";
import type {
    StoryPlot,
    StoryScene,
} from "../vscode_runtime/commands/identify_story_plots";
import type { WorkProgress } from "../vscode_runtime/server/jobs";
import type {
    SalientConceptInTheStory,
    StoryTextSpan,
} from "../vscode_runtime/storydoc/story_words";

declare function acquireVsCodeApi(): { postMessage: SendMessagesToVscode };

interface WhatThePanelDraws {
    models?: ModelServingStatus[] | null;
    jobs?: AsyncJobStatus[] | null;
    salientConcepts?: SalientConceptInTheStory[] | null;
    salientConceptSelected?: string | null;
    storyTextSelected?: StoryTextSpan | null;
    storyScenes?: StoryScene[] | null;
    storyPlots?: StoryPlot[] | null;
    storyPlotsProgress?: WorkProgress | null;
}

function processMessageFromVscode(
    message: MessageEvent,
    drawn: WhatThePanelDraws,
): boolean {
    if (message.data?.type === "models") {
        drawn.models = message.data.models as ModelServingStatus[] | null;
    } else if (message.data?.type === "jobs") {
        drawn.jobs = message.data.jobs as AsyncJobStatus[] | null;
    } else if (message.data?.type === "salientConcepts") {
        drawn.salientConcepts = message.data.salientConcepts as
            | SalientConceptInTheStory[]
            | null;
        drawn.salientConceptSelected = message.data.salientConceptSelected as
            | string
            | null;
        drawn.storyTextSelected = message.data
            .storyTextSelected as StoryTextSpan | null;
    } else if (message.data?.type === "storyPlots") {
        drawn.storyScenes = message.data.storyScenes as StoryScene[] | null;
        drawn.storyPlots = message.data.storyPlots as StoryPlot[] | null;
        drawn.storyPlotsProgress = message.data
            .storyPlotsProgress as WorkProgress | null;
    } else {
        return false;
    }
    return true;
}

function openTheAuthorshipPanel(): void {
    const sendMessagesToVscode: SendMessagesToVscode =
        acquireVsCodeApi().postMessage;
    const root = createRoot(document.getElementById("authorship-panel-root")!);
    const drawn: WhatThePanelDraws = {};

    function drawThePanel(): void {
        root.render(
            <AuthorshipPanelCanvas
                models={drawn.models}
                jobs={drawn.jobs}
                salientConcepts={drawn.salientConcepts}
                salientConceptSelected={drawn.salientConceptSelected}
                storyTextSelected={drawn.storyTextSelected}
                storyScenes={drawn.storyScenes}
                storyPlots={drawn.storyPlots}
                storyPlotsProgress={drawn.storyPlotsProgress}
                sendMessagesToVscode={sendMessagesToVscode}
            />,
        );
    }

    window.addEventListener("message", (message: MessageEvent) => {
        if (processMessageFromVscode(message, drawn)) {
            drawThePanel();
        }
    });

    drawThePanel();
    // The host has nothing to push until we ask: a message it posted before this
    // script ran would simply be gone.
    sendMessagesToVscode({ type: "ready" });
}

openTheAuthorshipPanel();
