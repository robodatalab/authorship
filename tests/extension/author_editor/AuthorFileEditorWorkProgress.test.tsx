import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { AuthorFileEditorWorkProgress } from "../../../extension/webview/author_editor/AuthorFileEditorWorkProgress";
import type { WorkProgress } from "../../../extension/vscode_runtime/server/jobs";

async function drawn(progress: WorkProgress): Promise<void> {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
        createRoot(container).render(
            <AuthorFileEditorWorkProgress progress={progress} />,
        );
    });
}

function stepsShown(): string[] {
    return [
        ...document.querySelectorAll(".author-file-editor-work-progress-step-says"),
    ].map((says) =>
        [...says.childNodes]
            .map((said) => said.textContent?.trim())
            .filter(Boolean)
            .join(" "),
    );
}

function countsShown(): string[] {
    return [
        ...document.querySelectorAll(
            ".author-file-editor-work-progress-step-counted:not(.author-file-editor-work-progress-step-counted-filled)",
        ),
    ].map((counted) => counted.textContent ?? "");
}

describe("how far along a job is", () => {
    it("draws every step with what it does, how far it got and for how long", async () => {
        await drawn({
            doing: "identify plots",
            done: 0,
            of: null,
            seconds: 111,
            state: "running",
            steps: [
                {
                    doing: "asking whether the events share a plot",
                    done: 15,
                    of: 15,
                    seconds: 31,
                    state: "done",
                    steps: [],
                },
                {
                    doing: "stitching the events into plots",
                    done: 3,
                    of: null,
                    seconds: 80,
                    state: "running",
                    steps: [],
                },
            ],
        });

        expect(stepsShown()).toEqual([
            "asking whether the events share a plot 0:31",
            "stitching the events into plots 1:20",
        ]);
        expect(countsShown()).toEqual(["15 of 15", "3"]);
        expect(
            [
                ...document.querySelectorAll(
                    ".author-file-editor-work-progress-step",
                ),
            ].map((step) => step.className),
        ).toEqual([
            "author-file-editor-work-progress-step author-file-editor-work-progress-step-done",
            "author-file-editor-work-progress-step author-file-editor-work-progress-step-running",
        ]);
    });

    it("reckons the time left from the rate the step is going at", async () => {
        await drawn({
            doing: "identify plots",
            done: 0,
            of: null,
            seconds: 80,
            state: "running",
            steps: [
                {
                    doing: "asking whether the events share a plot",
                    done: 100,
                    of: 400,
                    seconds: 80,
                    state: "running",
                    steps: [],
                },
            ],
        });

        expect(stepsShown()).toEqual([
            "asking whether the events share a plot 1:20 / 5:20",
        ]);
    });

    it("nests the steps of a step in its drawer, open while it runs", async () => {
        await drawn({
            doing: "identify plots",
            done: 0,
            of: null,
            seconds: 10,
            state: "running",
            steps: [
                {
                    doing: "passes",
                    done: 1,
                    of: 2,
                    seconds: 10,
                    state: "running",
                    steps: [
                        {
                            doing: "reading the chapters",
                            done: 24,
                            of: 24,
                            seconds: 4,
                            state: "done",
                            steps: [],
                        },
                    ],
                },
                {
                    doing: "publishing",
                    done: 0,
                    of: 1,
                    seconds: 0,
                    state: "waiting",
                    steps: [],
                },
            ],
        });

        const drawers = [
            ...document.querySelectorAll<HTMLDetailsElement>(
                ".author-file-editor-work-progress-steps",
            ),
        ];
        expect(drawers.map((drawer) => drawer.open)).toEqual([true]);
        expect(
            drawers[0].querySelector(
                ":scope > .author-file-editor-work-progress-step .author-file-editor-work-progress-step-says",
            )?.textContent,
        ).toContain("reading the chapters");
        expect(stepsShown()).toEqual([
            "passes 0:10 / 0:20",
            "reading the chapters 0:04",
            "publishing",
        ]);
    });
});
