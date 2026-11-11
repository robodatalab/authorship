import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AuthorFileEditorStoryGeneration } from "../../../extension/webview/author_editor/AuthorFileEditorStoryGeneration";
import type { StoryGeneration } from "../../../extension/vscode_runtime/story_generation";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ASKS_FOR_THE_CONCEPTS: StoryGeneration = {
    running: true,
    error: null,
    progress: { steps: [{ doing: "concept titles", done: 0, of: 0 }] },
    stages: [
        { name: "concept titles", done: false },
        { name: "concepts", done: false },
        { name: "plots", done: false },
    ],
    asked: {
        number: 1,
        story: "",
        shown: {
            kind: "command",
            cellKind: "salient-concept",
            commandName: "addStoryAnnotation",
        },
    },
};

const ASKS_FOR_A_REVIEW: StoryGeneration = {
    running: true,
    error: null,
    progress: { steps: [{ doing: "concepts", done: 1, of: 1 }] },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: false },
        { name: "plots", done: false },
    ],
    asked: {
        number: 2,
        story: '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\nA mother\'s care.\n',
        shown: { kind: "tab", cellKind: "salient-concept" },
    },
};

const WRITES: StoryGeneration = {
    running: true,
    error: null,
    progress: { steps: [{ doing: "plots", done: 3, of: 15 }] },
    stages: [
        { name: "concept titles", done: true },
        { name: "concepts", done: true },
        { name: "plots", done: false },
        { name: "mesh", done: false },
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

    it("shows how far along the stage it is at is, while it works", async () => {
        await mountTheStoryGeneration(WRITES);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe("plots: step 4 of 15");
    });

    it("asks the author to use the command shown, then continue or stop", async () => {
        await mountTheStoryGeneration(ASKS_FOR_THE_CONCEPTS);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe(
            "concept titles: use the highlighted button, then continueContinueStop",
        );
    });

    it("asks the author to review the story the stage leaves, then accept or stop", async () => {
        await mountTheStoryGeneration(ASKS_FOR_A_REVIEW);

        const status = document.querySelector(
            ".author-file-editor-story-generation-status",
        )!;
        expect(status.textContent).toBe(
            "concepts: review it, edit what you like, then acceptAcceptStop",
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

    it("stopping answers with a stop", async () => {
        await mountTheStoryGeneration(ASKS_FOR_A_REVIEW);
        const [, stopButton] = document.querySelectorAll("button");

        await act(async () => stopButton.click());

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "answerTheStoryGeneration",
                commandArguments: { verdict: "stop" },
            },
        ]);
    });
});
