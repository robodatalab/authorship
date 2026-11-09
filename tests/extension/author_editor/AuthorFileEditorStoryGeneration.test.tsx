import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AuthorFileEditorStoryGeneration } from "../../../extension/webview/author_editor/AuthorFileEditorStoryGeneration";
import type { StoryGeneration } from "../../../extension/vscode_runtime/story_generation";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ASKS_FOR_THE_CONCEPTS: StoryGeneration = {
    running: true,
    error: null,
    progress: { steps: [{ doing: "concepts", done: 0, of: 2 }] },
    asked: {
        number: 1,
        story: null,
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
    progress: { steps: [{ doing: "concepts", done: 1, of: 2 }] },
    asked: {
        number: 2,
        story: '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\nA mother\'s care.\n',
        shown: {
            kind: "annotation",
            cellKind: "salient-concept",
            annotationCellId: "k1",
            passageId: null,
        },
    },
};

const WRITES: StoryGeneration = {
    running: true,
    error: null,
    progress: { steps: [{ doing: "plots", done: 3, of: 15 }] },
    asked: null,
};

describe("the story generation in the main menu", () => {
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

    it("shows only the stage while the generation writes", async () => {
        await mountTheStoryGeneration(WRITES);

        expect(container.textContent).toBe("plots: step 4 of 15");
    });

    it("offers to continue or stop while the author works on the story", async () => {
        await mountTheStoryGeneration(ASKS_FOR_THE_CONCEPTS);

        expect(container.textContent).toBe("concepts: step 1 of 2ContinueStop");
    });

    it("offers to accept, revise or stop a story to review", async () => {
        await mountTheStoryGeneration(ASKS_FOR_A_REVIEW);

        expect(container.textContent).toBe(
            "concepts: step 2 of 2AcceptReviseStop",
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
                commandArguments: { verdict: "accept", comment: "" },
            },
        ]);
    });

    it("revising sends what should change once Enter is pressed", async () => {
        await mountTheStoryGeneration(ASKS_FOR_A_REVIEW);
        const [, reviseButton] = document.querySelectorAll("button");
        await act(async () => reviseButton.click());
        const commentBox = document.querySelector<HTMLInputElement>(
            ".author-file-editor-story-generation-comment",
        )!;
        const setTheValue = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )!.set!;

        await act(async () => {
            setTheValue.call(commentBox, "make it shorter");
            commentBox.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => {
            commentBox.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
        });

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "answerTheStoryGeneration",
                commandArguments: { verdict: "revise", comment: "make it shorter" },
            },
        ]);
    });

    it("stopping answers with a stop", async () => {
        await mountTheStoryGeneration(ASKS_FOR_A_REVIEW);
        const [, , stopButton] = document.querySelectorAll("button");

        await act(async () => stopButton.click());

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "answerTheStoryGeneration",
                commandArguments: { verdict: "stop", comment: "" },
            },
        ]);
    });
});
