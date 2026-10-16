import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type {
    SalientConceptInTheStory,
    StoryTextSpan,
} from "../../../extension/vscode_runtime/storydoc/story_words";

vi.mock(
    "monaco-editor/editor/contrib/multicursor/browser/multicursor.js",
    () => ({}),
);
vi.mock("monaco-editor/languages/definitions/markdown/markdown.js", () => ({
    conf: {},
    language: {},
}));
vi.mock("monaco-editor/editor/editor.api", async () => {
    const { monacoEditorApi } = await import("../markdown/monaco_editor_double");
    return monacoEditorApi();
});

const { monacoEditorsOnThePage } = await import(
    "../markdown/monaco_editor_double"
);

const { AuthorshipPanelSalientConcepts } = await import(
    "../../../extension/webview/panel/AuthorshipPanelSalientConcepts"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("the salient concepts tab", () => {
    let posted: unknown[] = [];
    let root: Root;

    interface WhatTheTabIsGiven {
        salientConcepts: SalientConceptInTheStory[] | null;
        salientConceptSelected?: string | null;
        storyTextSelected?: StoryTextSpan | null;
    }

    async function mountSalientConcepts(
        options: WhatTheTabIsGiven,
    ): Promise<void> {
        posted = [];
        monacoEditorsOnThePage.length = 0;
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await redrawSalientConcepts(options);
    }

    async function redrawSalientConcepts(
        options: WhatTheTabIsGiven,
    ): Promise<void> {
        await act(async () => {
            root.render(
                <AuthorshipPanelSalientConcepts
                    salientConcepts={options.salientConcepts}
                    salientConceptSelected={
                        options.salientConceptSelected ?? null
                    }
                    storyTextSelected={options.storyTextSelected ?? null}
                    sendMessagesToVscode={(message) => posted.push(message)}
                />,
            );
        });
    }

    async function click(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
    }

    it("says so when no manuscript is open", async () => {
        await mountSalientConcepts({ salientConcepts: null });

        expect(document.body.textContent).toBe("No manuscript open");
    });

    it.each([
        { story: "none yet", salientConcepts: [] },
        {
            story: "one already",
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [],
                },
            ],
        },
    ])(
        "asks for a new concept to be added when the story holds $story",
        async ({ salientConcepts }) => {
            await mountSalientConcepts({ salientConcepts });

            await click(
                document.querySelector(
                    'button[aria-label="Add a salient concept"]',
                )!,
            );

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "addSalientConcept",
                    commandArguments: {},
                },
            ]);
        },
    );

    it("lists every concept by its title", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
                {
                    conceptCellId: "k2",
                    title: "Bell",
                    description: "What he heard.",
                    storyWordRanges: [],
                },
            ],
        });

        expect(
            [
                ...document.querySelectorAll(
                    ".authorship-panel-salient-concept-title",
                ),
            ].map((title) => title.textContent),
        ).toEqual(["Door", "Bell"]);
    });

    it("asks the host to select the concept clicked", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
                {
                    conceptCellId: "k2",
                    title: "Bell",
                    description: "What he heard.",
                    storyWordRanges: [],
                },
            ],
        });

        await click(
            document.querySelectorAll(
                ".authorship-panel-salient-concept-title",
            )[1],
        );

        expect(posted).toEqual([
            { type: "selectSalientConcept", conceptCellId: "k2" },
        ]);
    });

    it("asks the host to let go of the selected concept when it is clicked again", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
                {
                    conceptCellId: "k2",
                    title: "Bell",
                    description: "What he heard.",
                    storyWordRanges: [],
                },
            ],
            salientConceptSelected: "k1",
        });

        await click(
            document.querySelector(".authorship-panel-salient-concept-title")!,
        );

        expect(posted).toEqual([
            { type: "selectSalientConcept", conceptCellId: null },
        ]);
    });

    it("shows the selected concept's title, description and examples below the list", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
                {
                    conceptCellId: "k2",
                    title: "Bell",
                    description: "What he heard.",
                    storyWordRanges: [],
                },
            ],
            salientConceptSelected: "k1",
        });

        expect(
            document.querySelector<HTMLInputElement>(
                ".author-file-editor-cell-field-input",
            )!.value,
        ).toBe("Door");
        expect(
            document.querySelector(".markdown-rendered p")?.textContent,
        ).toBe("What she saw.");
        expect(
            document.querySelector(
                ".authorship-panel-salient-concept-example-shown",
            )?.textContent,
        ).toBe("the door.");
    });

    it("asks for the title to be replaced as the author types it", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [],
                },
            ],
            salientConceptSelected: "k1",
        });
        const titleBox = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!;

        await act(async () => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )!.set!.call(titleBox, "Doors");
            titleBox.dispatchEvent(new Event("input", { bubbles: true }));
        });

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "replaceAttribute",
                commandArguments: {
                    cellId: "k1",
                    attributeName: "title",
                    attributeValue: "Doors",
                },
            },
        ]);
    });

    it("tells the host the description the author types", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [],
                },
            ],
            salientConceptSelected: "k1",
        });

        await act(async () => {
            document
                .querySelector(".markdown-rendered")!
                .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        });
        await act(async () => {
            monacoEditorsOnThePage[0].putTheCursorAt(13);
            monacoEditorsOnThePage[0].typeCharacter("!");
        });

        expect(posted).toEqual([
            { type: "typed", cellId: "k1", markdown: "What she saw.!" },
        ]);
    });

    it("shows the description the host rewrote, as after an undo", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [],
                },
            ],
            salientConceptSelected: "k1",
        });

        await redrawSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she opened.",
                    storyWordRanges: [],
                },
            ],
            salientConceptSelected: "k1",
        });

        expect(
            document.querySelector(".markdown-rendered p")?.textContent,
        ).toBe("What she opened.");
    });

    it("asks for the concept whose bin is pressed to be deleted", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [],
                },
                {
                    conceptCellId: "k2",
                    title: "Bell",
                    description: "What he heard.",
                    storyWordRanges: [],
                },
            ],
        });

        await click(
            document.querySelectorAll(
                ".authorship-panel-salient-concept-deleted",
            )[1],
        );

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "deleteSalientConcept",
                commandArguments: { conceptCellId: "k2" },
            },
        ]);
    });

    it("counts each concept's examples in a column beside its title", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                        {
                            firstWord: 6,
                            lastWord: 7,
                            cellId: "c3",
                            wordsItCovers: "the bell.",
                        },
                    ],
                },
                {
                    conceptCellId: "k2",
                    title: "Bell",
                    description: "What he heard.",
                    storyWordRanges: [],
                },
            ],
        });

        expect(
            [
                ...document.querySelectorAll(
                    ".authorship-panel-salient-concept-examples-count",
                ),
            ].map((count) => count.textContent),
        ).toEqual(["2", "0"]);
    });

    it("lists the examples newest first", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                        {
                            firstWord: 6,
                            lastWord: 7,
                            cellId: "c3",
                            wordsItCovers: "the bell.",
                        },
                    ],
                },
            ],
            salientConceptSelected: "k1",
        });

        expect(
            [
                ...document.querySelectorAll(
                    ".authorship-panel-salient-concept-example-shown",
                ),
            ].map((example) => example.textContent),
        ).toEqual(["the bell.", "the door."]);
    });

    it("asks the host to show the words of an example", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
            ],
            salientConceptSelected: "k1",
        });

        await click(
            document.querySelector(
                ".authorship-panel-salient-concept-example-shown",
            )!,
        );

        expect(posted).toEqual([
            { type: "showStoryWordRange", firstWord: 2, lastWord: 3 },
        ]);
    });

    it("asks for an example's words to be taken out of the concept", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
            ],
            salientConceptSelected: "k1",
        });

        await click(
            document.querySelector(
                ".authorship-panel-salient-concept-example-removed",
            )!,
        );

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeStoryWordRange",
                commandArguments: {
                    conceptCellId: "k1",
                    firstWord: 2,
                    lastWord: 3,
                },
            },
        ]);
    });

    it("cannot assign anything until words are selected", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
            ],
            salientConceptSelected: "k1",
        });

        expect(
            document.querySelector<HTMLButtonElement>(
                ".authorship-panel-salient-concept-assign",
            )!.disabled,
        ).toBe(true);
    });

    it("asks for the selected words to be assigned to the selected concept", async () => {
        await mountSalientConcepts({
            salientConcepts: [
                {
                    conceptCellId: "k1",
                    title: "Door",
                    description: "What she saw.",
                    storyWordRanges: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
            ],
            salientConceptSelected: "k1",
            storyTextSelected: {
                cellId: "m1",
                startCharacterOffsetInCell: 4,
                endCharacterOffsetInCell: 8,
            },
        });

        await click(
            document.querySelector(".authorship-panel-salient-concept-assign")!,
        );

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "assignStoryText",
                commandArguments: {
                    conceptCellId: "k1",
                    cellId: "m1",
                    startCharacterOffsetInCell: 4,
                    endCharacterOffsetInCell: 8,
                },
            },
        ]);
    });
});
