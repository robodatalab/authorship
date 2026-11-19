import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AuthorFileEditorStoryGeneration } from "../../../extension/webview/author_editor/AuthorFileEditorStoryGeneration";
import type { StoryGeneration } from "../../../extension/vscode_runtime/story_generation";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ASKS_FOR_THE_CONCEPTS: StoryGeneration = {
    running: false,
    error: null,
    progress: { steps: [{ doing: "concept titles", done: 0, of: 0, seconds: 2, secondsPerItem: null, state: "done", steps: [] }] },
    stages: [
        { name: "concept titles", done: false },
        { name: "concepts", done: false },
        { name: "plots", done: false },
    ],
    asked: {
        stage: "concept titles",
        story: "",
        shown: {
            kind: "command",
            cellKind: "salient-concept",
            commandName: "insertCell",
        },
    },
};

const ASKS_FOR_A_REVIEW: StoryGeneration = {
    running: false,
    error: null,
    progress: { steps: [{ doing: "concepts", done: 1, of: 1, seconds: 9, secondsPerItem: 9, state: "done", steps: [] }] },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: false },
        { name: "plots", done: false },
    ],
    asked: {
        stage: "concepts",
        story: '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\nA mother\'s care.\n',
        shown: { kind: "cells", cellKind: "salient-concept" },
    },
};

const WRITES: StoryGeneration = {
    running: true,
    error: null,
    progress: {
        steps: [{ doing: "plots", done: 3, of: 15, seconds: 12, secondsPerItem: 4, state: "running", steps: [] }],
    },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: true },
        { name: "plots", done: false },
        { name: "mesh", done: false },
    ],
    asked: null,
};

const WRITES_THE_FIRST_STEP: StoryGeneration = {
    running: true,
    error: null,
    progress: {
        steps: [{ doing: "plots", done: 0, of: 15, seconds: 3, secondsPerItem: null, state: "running", steps: [] }],
    },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: true },
        { name: "plots", done: false },
        { name: "mesh", done: false },
    ],
    asked: null,
};

const WRITES_QUICK_STEPS: StoryGeneration = {
    running: true,
    error: null,
    progress: {
        steps: [{ doing: "plots", done: 3, of: 15, seconds: 1, secondsPerItem: 0.25, state: "running", steps: [] }],
    },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: true },
        { name: "plots", done: false },
        { name: "mesh", done: false },
    ],
    asked: null,
};

const PLAYS_THE_STORY: StoryGeneration = {
    running: true,
    error: null,
    progress: {
        steps: [
            {
                doing: "validity",
                done: 1,
                of: 4,
                seconds: 80,
                secondsPerItem: 80,
                state: "running",
                steps: [
                    { doing: "Motherhood", done: 200, of: 200, seconds: 80, secondsPerItem: 0.4, state: "done", steps: [] },
                    { doing: "War", done: 100, of: 200, seconds: 40, secondsPerItem: 0.4, state: "running", steps: [] },
                ],
            },
        ],
    },
    stages: [
        { name: "choices", done: true },
        { name: "validity", done: false },
    ],
    asked: null,
};

const LEFT_OFF: StoryGeneration = {
    running: false,
    error: null,
    progress: { steps: [] },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: true },
        { name: "plots", done: false },
    ],
    asked: null,
};

describe("the story generation under the main menu's tools", () => {
    let posted: unknown[];
    let container: HTMLElement;
    let root: Root;

    afterEach(() => act(() => root.unmount()));

    async function mountTheStoryGeneration(
        storyGeneration: StoryGeneration | null,
    ): Promise<void> {
        posted = [];
        document.body.innerHTML = "";
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await act(async () => {
            root.render(
                <AuthorFileEditorStoryGeneration
                    storyGeneration={storyGeneration}
                    sendMessagesToVscode={(message) => posted.push(message)}
                />,
            );
        });
    }

    it("shows nothing while no story is being generated", async () => {
        await mountTheStoryGeneration(null);

        expect(container.textContent).toBe("");
    });

    it("shows the stages finished, the one it is at and those to come", async () => {
        await mountTheStoryGeneration(WRITES);

        const [titles, concepts] = document.querySelectorAll(
            ".author-file-editor-story-generation-stage-done",
        );
        const current = document.querySelector('[aria-current="step"]')!;
        const [mesh] = document.querySelectorAll(
            ".author-file-editor-story-generation-stage-to-come",
        );
        expect(titles.textContent).toBe("concept titles");
        expect(concepts.textContent).toBe("concepts");
        expect(current.textContent).toBe("plots");
        expect(mesh.textContent).toBe("mesh");
    });

    it("spins the icon of the stage it is at, while it works", async () => {
        await mountTheStoryGeneration(WRITES);

        const icon = document.querySelector('[aria-current="step"] i')!;
        expect(icon.className).toBe("codicon codicon-loading codicon-modifier-spin");
    });

    it("stills the icon of the stage it is at, while it waits for the author", async () => {
        await mountTheStoryGeneration(ASKS_FOR_A_REVIEW);

        const icon = document.querySelector('[aria-current="step"] i')!;
        expect(icon.className).toBe("codicon codicon-circle-filled");
    });

    it("pauses the icon of the stage it left off at", async () => {
        await mountTheStoryGeneration(LEFT_OFF);

        const icon = document.querySelector('[aria-current="step"] i')!;
        expect(icon.className).toBe("codicon codicon-debug-pause");
    });

    it("says where it left off, for the author to resume", async () => {
        await mountTheStoryGeneration(LEFT_OFF);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe("plots: left off hereResumeQuit");
    });

    it("resuming generates the story again, from where it left off", async () => {
        await mountTheStoryGeneration(LEFT_OFF);
        const [resumeButton] = document.querySelectorAll("button");

        await act(async () => resumeButton.click());

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "generateStory",
                commandArguments: {},
            },
        ]);
    });

    it("shows how far along the stage it is at is in a bar, while it works", async () => {
        await mountTheStoryGeneration(WRITES);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        const bar = status.querySelector('[role="progressbar"]')!;
        const filled = bar.firstElementChild as HTMLElement;
        expect(bar.getAttribute("aria-valuenow")).toBe("20");
        expect(filled.style.width).toBe("20%");
    });

    it("says, like tqdm, the steps done, the time taken and left, and the time a step takes", async () => {
        await mountTheStoryGeneration(WRITES);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe("plots20%3/15 [00:12<00:48, 4.00s/it]Quit");
    });

    it("says the time left and the rate are unknown before the first step is done", async () => {
        await mountTheStoryGeneration(WRITES_THE_FIRST_STEP);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe("plots0%0/15 [00:03<?, ?it/s]Quit");
    });

    it("says the rate in steps a second for steps quicker than a second", async () => {
        await mountTheStoryGeneration(WRITES_QUICK_STEPS);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe("plots20%3/15 [00:01<00:03, 4.00it/s]Quit");
    });

    it("fills the bar with the work done in the step it is at, too", async () => {
        await mountTheStoryGeneration(PLAYS_THE_STORY);

        const bar = document.querySelector('[role="progressbar"]')!;
        const filled = bar.firstElementChild as HTMLElement;
        expect(bar.getAttribute("aria-valuenow")).toBe("38");
        expect(filled.style.width).toBe("37.5%");
    });

    it("leaves the work done in the step it is at out of the time left", async () => {
        await mountTheStoryGeneration(PLAYS_THE_STORY);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe("validity38%1/4 [01:20<03:20, 80.00s/it]Quit");
    });

    it("names the stage that asks the author to use the command shown, then continue or reject", async () => {
        await mountTheStoryGeneration(ASKS_FOR_THE_CONCEPTS);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe(
            "concept titlesContinueRejectQuit",
        );
    });

    it("asks the author to review the story the stage leaves, then accept or reject", async () => {
        await mountTheStoryGeneration(ASKS_FOR_A_REVIEW);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe(
            "concepts: review it, edit what you like, then acceptAcceptRejectQuit",
        );
    });

    it("continuing answers with an accept", async () => {
        await mountTheStoryGeneration(ASKS_FOR_THE_CONCEPTS);
        const [continueButton] = document.querySelectorAll("button");

        await act(async () => continueButton.click());

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "answerTheStoryGeneration",
                commandArguments: { verdict: "accept" },
            },
        ]);
    });

    it("rejecting answers with a reject", async () => {
        await mountTheStoryGeneration(ASKS_FOR_A_REVIEW);
        const [, rejectButton] = document.querySelectorAll("button");

        await act(async () => rejectButton.click());

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "answerTheStoryGeneration",
                commandArguments: { verdict: "reject" },
            },
        ]);
    });

    it.each([
        ["while a stage works", WRITES],
        ["while a stage asks for a review", ASKS_FOR_A_REVIEW],
        ["once it has left off", LEFT_OFF],
    ])("quits the generation altogether %s", async (_, storyGeneration) => {
        await mountTheStoryGeneration(storyGeneration);
        const quitButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent === "Quit",
        )!;

        await act(async () => quitButton.click());

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "quitTheStoryGeneration",
                commandArguments: {},
            },
        ]);
    });

});
