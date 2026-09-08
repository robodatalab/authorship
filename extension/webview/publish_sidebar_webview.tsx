import { createRoot } from "react-dom/client";
import {
    AuthorshipPanelCanvas,
    type SendMessagesToVscode,
} from "./panel/AuthorshipPanelCanvas";
import type { GeminiAccountStatus } from "./panel/AuthorshipPanelGeminiAccount";
import type { ModelServingStatus } from "./panel/AuthorshipPanelResourceManager";
import type { MemoryInUse } from "./panel/AuthorshipPanelMemory";
import type { AsyncJobStatus } from "./panel/AuthorshipPanelAsyncJobs";

declare function acquireVsCodeApi(): { postMessage: SendMessagesToVscode };

interface WhatThePanelDraws {
    account?: GeminiAccountStatus;
    models?: ModelServingStatus[] | null;
    memory?: MemoryInUse | null;
    jobs?: AsyncJobStatus[] | null;
}

function processMessageFromVscode(
    message: MessageEvent,
    drawn: WhatThePanelDraws,
): boolean {
    if (message.data?.type === "account") {
        drawn.account = {
            off: Boolean(message.data.off),
            label: message.data.account as string | null,
            model: (message.data.model as string) ?? "",
            shipped: (message.data.shipped as string) ?? "",
            models:
                (message.data.models as GeminiAccountStatus["models"]) ?? [],
        };
    } else if (message.data?.type === "models") {
        drawn.models = message.data.models as ModelServingStatus[] | null;
    } else if (message.data?.type === "memory") {
        drawn.memory = message.data.memory as MemoryInUse | null;
    } else if (message.data?.type === "jobs") {
        drawn.jobs = message.data.jobs as AsyncJobStatus[] | null;
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
                account={drawn.account}
                models={drawn.models}
                memory={drawn.memory}
                jobs={drawn.jobs}
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
