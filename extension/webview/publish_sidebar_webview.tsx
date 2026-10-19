import { createRoot } from "react-dom/client";
import {
    AuthorshipPanelCanvas,
    type SendMessagesToVscode,
} from "./panel/AuthorshipPanelCanvas";
import type { ModelServingStatus } from "./panel/AuthorshipPanelServingStatus";
import type { AsyncJobStatus } from "./panel/AuthorshipPanelAsyncJobs";
import type { StoryAnnotationInTheStory } from "../vscode_runtime/storydoc/iterators/story_annotations_iterator";
import type { StoryAnnotationSelected } from "../vscode_runtime/story_annotation_selection";
import type { StoryTextSpan } from "../vscode_runtime/storydoc/iterators/story_words_iterator";

declare function acquireVsCodeApi(): { postMessage: SendMessagesToVscode };

interface WhatThePanelDraws {
    models?: ModelServingStatus[] | null;
    jobs?: AsyncJobStatus[] | null;
    storyAnnotations?: Record<string, StoryAnnotationInTheStory[]> | null;
    storyAnnotationsSelected?: Record<string, StoryAnnotationSelected>;
    storyTextSelected?: StoryTextSpan | null;
}

function processMessageFromVscode(
    message: MessageEvent,
    drawn: WhatThePanelDraws,
): boolean {
    if (message.data?.type === "models") {
        drawn.models = message.data.models as ModelServingStatus[] | null;
    } else if (message.data?.type === "jobs") {
        drawn.jobs = message.data.jobs as AsyncJobStatus[] | null;
    } else if (message.data?.type === "storyAnnotations") {
        drawn.storyAnnotations = message.data.storyAnnotations as Record<
            string,
            StoryAnnotationInTheStory[]
        > | null;
        drawn.storyAnnotationsSelected = message.data
            .storyAnnotationsSelected as Record<string, StoryAnnotationSelected>;
        drawn.storyTextSelected = message.data
            .storyTextSelected as StoryTextSpan | null;
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
                storyAnnotations={drawn.storyAnnotations}
                storyAnnotationsSelected={drawn.storyAnnotationsSelected}
                storyTextSelected={drawn.storyTextSelected}
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
