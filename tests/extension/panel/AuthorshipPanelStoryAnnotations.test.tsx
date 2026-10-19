import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { StoryAnnotationInTheStory } from "../../../extension/vscode_runtime/storydoc/iterators/story_annotation_in_the_story";
import type { StoryAnnotationSelected } from "../../../extension/vscode_runtime/story_annotation_selection";
import type { StoryTextSpan } from "../../../extension/vscode_runtime/storydoc/iterators/story_text_span";

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

const { AuthorshipPanelStoryAnnotations } = await import(
    "../../../extension/webview/panel/AuthorshipPanelStoryAnnotations"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("the tab of a kind of story annotation", () => {
    let posted: unknown[] = [];
    let root: Root;

    interface WhatTheTabIsGiven {
        cellKind?: string;
        storyAnnotations: StoryAnnotationInTheStory[] | null;
        storyAnnotationSelected?: StoryAnnotationSelected;
        storyTextSelected?: StoryTextSpan | null;
        listsThePassagesNewestFirst?: boolean;
    }

    async function mountStoryAnnotations(
        options: WhatTheTabIsGiven,
    ): Promise<void> {
        posted = [];
        monacoEditorsOnThePage.length = 0;
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await redrawStoryAnnotations(options);
    }

    async function redrawStoryAnnotations(
        options: WhatTheTabIsGiven,
    ): Promise<void> {
        await act(async () => {
            root.render(
                <AuthorshipPanelStoryAnnotations
                    cellKind={options.cellKind ?? "plot"}
                    storyAnnotations={options.storyAnnotations}
                    storyAnnotationSelected={
                        options.storyAnnotationSelected ?? {
                            annotationCellId: null,
                            passage: null,
                        }
                    }
                    storyTextSelected={options.storyTextSelected ?? null}
                    wording={{
                        addAnAnnotation: "Add a plot",
                        noAnnotationsYet: "No plots yet",
                        selectAnAnnotation:
                            "Select a plot to see its abstract and trajectory",
                        deleteTheAnnotation: "Delete this plot",
                        passagesHeading: "Trajectory",
                        passagesCounted: "Spans",
                        assignTheWordsSelected:
                            "Add the selected words to the trajectory",
                        noPassagesYet: "No words in the trajectory yet",
                        takeThePassageOut:
                            "Take these words out of the trajectory",
                    }}
                    listsThePassagesNewestFirst={
                        options.listsThePassagesNewestFirst ?? false
                    }
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
        await mountStoryAnnotations({ storyAnnotations: null });

        expect(document.body.textContent).toBe("No manuscript open");
    });

    it.each([{ cellKind: "salient-concept" }, { cellKind: "plot" }])(
        "asks for a new $cellKind to be added",
        async ({ cellKind }) => {
            await mountStoryAnnotations({ cellKind, storyAnnotations: [] });
            const addButton = document.querySelector(
                ".authorship-panel-toolbar-button",
            )!;

            await click(addButton);

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "addStoryAnnotation",
                    commandArguments: { cellKind },
                },
            ]);
        },
    );

    it("lists every annotation by its title", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [],
                },
                {
                    annotationCellId: "p2",
                    title: "The bell",
                    description: "He hears the bell.",
                    passages: [],
                },
            ],
        });

        const titlesListed = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-title",
            ),
        ].map((title) => title.textContent);
        expect(titlesListed).toEqual(["The door", "The bell"]);
    });

    it.each([
        {
            clicked: "one not selected",
            selected: null,
            clickedTitle: 1,
            annotationCellId: "p2",
        },
        {
            clicked: "the one selected",
            selected: "p1",
            clickedTitle: 0,
            annotationCellId: null,
        },
    ])(
        "asks the host to select the annotation clicked, letting go when it clicks $clicked",
        async ({ selected, clickedTitle, annotationCellId }) => {
            await mountStoryAnnotations({
                storyAnnotations: [
                    {
                        annotationCellId: "p1",
                        title: "The door",
                        description: "She finds the door.",
                        passages: [],
                    },
                    {
                        annotationCellId: "p2",
                        title: "The bell",
                        description: "He hears the bell.",
                        passages: [],
                    },
                ],
                storyAnnotationSelected: {
                    annotationCellId: selected,
                    passage: null,
                },
            });
            const title = document.querySelectorAll(
                ".authorship-panel-story-annotation-title",
            )[clickedTitle];

            await click(title);

            expect(posted).toEqual([
                {
                    type: "selectStoryAnnotation",
                    cellKind: "plot",
                    annotationCellId,
                },
            ]);
        },
    );

    it("shows the selected annotation's title, description and passages below the list", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
            ],
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });

        const titleShown = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!.value;
        const descriptionShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        const passageShown = document.querySelector(
            ".authorship-panel-story-annotation-passage-shown",
        )?.textContent;
        expect(titleShown).toBe("The door");
        expect(descriptionShown).toBe("She finds the door.");
        expect(passageShown).toBe("the door.");
    });

    it("asks for the title to be replaced as the author types it", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [],
                },
            ],
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });
        const titleBox = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!;
        const setTheValue = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )!.set!;

        await act(async () => {
            setTheValue.call(titleBox, "The doors");
            titleBox.dispatchEvent(new Event("input", { bubbles: true }));
        });

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "replaceAttribute",
                commandArguments: {
                    cellId: "p1",
                    attributeName: "title",
                    attributeValue: "The doors",
                },
            },
        ]);
    });

    it("tells the host the description the author types", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [],
                },
            ],
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });
        const descriptionRendered =
            document.querySelector(".markdown-rendered")!;

        await act(async () => {
            descriptionRendered.dispatchEvent(
                new MouseEvent("dblclick", { bubbles: true }),
            );
        });
        await act(async () => {
            monacoEditorsOnThePage[0].putTheCursorAt(19);
            monacoEditorsOnThePage[0].typeCharacter("!");
        });

        expect(posted).toEqual([
            { type: "typed", cellId: "p1", markdown: "She finds the door.!" },
        ]);
    });

    it("shows the description the host rewrote, as after an undo", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [],
                },
            ],
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });

        await redrawStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She opens the door.",
                    passages: [],
                },
            ],
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });

        const descriptionShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        expect(descriptionShown).toBe("She opens the door.");
    });

    it("asks for the annotation whose bin is pressed to be deleted", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [],
                },
                {
                    annotationCellId: "p2",
                    title: "The bell",
                    description: "He hears the bell.",
                    passages: [],
                },
            ],
        });
        const secondBin = document.querySelectorAll(
            ".authorship-panel-story-annotation-deleted",
        )[1];

        await click(secondBin);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "deleteStoryAnnotation",
                commandArguments: { annotationCellId: "p2" },
            },
        ]);
    });

    it("counts the passages of each annotation in a column beside its title", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [
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
                    annotationCellId: "p2",
                    title: "The bell",
                    description: "He hears the bell.",
                    passages: [],
                },
            ],
        });

        const passagesCounted = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-passages-count",
            ),
        ].map((count) => count.textContent);
        expect(passagesCounted).toEqual(["2", "0"]);
    });

    it.each([
        {
            order: "in the order they are written",
            listsThePassagesNewestFirst: false,
            passagesListed: ["the door.", "the bell."],
        },
        {
            order: "newest first",
            listsThePassagesNewestFirst: true,
            passagesListed: ["the bell.", "the door."],
        },
    ])(
        "lists the passages $order",
        async ({ listsThePassagesNewestFirst, passagesListed }) => {
            await mountStoryAnnotations({
                storyAnnotations: [
                    {
                        annotationCellId: "p1",
                        title: "The door",
                        description: "She finds the door.",
                        passages: [
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
                storyAnnotationSelected: {
                    annotationCellId: "p1",
                    passage: null,
                },
                listsThePassagesNewestFirst,
            });

            const passagesShown = [
                ...document.querySelectorAll(
                    ".authorship-panel-story-annotation-passage-shown",
                ),
            ].map((passage) => passage.textContent);
            expect(passagesShown).toEqual(passagesListed);
        },
    );

    it.each([
        {
            order: "in the order they are written",
            listsThePassagesNewestFirst: false,
            passage: 1,
            firstWord: 6,
            lastWord: 7,
        },
        {
            order: "newest first",
            listsThePassagesNewestFirst: true,
            passage: 0,
            firstWord: 2,
            lastWord: 3,
        },
    ])(
        "asks the host to select the second passage listed $order, and to show its words",
        async ({
            listsThePassagesNewestFirst,
            passage,
            firstWord,
            lastWord,
        }) => {
            await mountStoryAnnotations({
                storyAnnotations: [
                    {
                        annotationCellId: "p1",
                        title: "The door",
                        description: "She finds the door.",
                        passages: [
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
                storyAnnotationSelected: {
                    annotationCellId: "p1",
                    passage: null,
                },
                listsThePassagesNewestFirst,
            });
            const secondPassageListed = document.querySelectorAll(
                ".authorship-panel-story-annotation-passage-shown",
            )[1];

            await click(secondPassageListed);

            expect(posted).toEqual([
                { type: "selectPassage", cellKind: "plot", passage },
                { type: "showStoryWordRange", firstWord, lastWord },
            ]);
        },
    );

    it.each([
        {
            order: "in the order they are written",
            listsThePassagesNewestFirst: false,
            passagesMarked: ["true", "false"],
        },
        {
            order: "newest first",
            listsThePassagesNewestFirst: true,
            passagesMarked: ["false", "true"],
        },
    ])(
        "marks the passage selected when listed $order",
        async ({ listsThePassagesNewestFirst, passagesMarked }) => {
            await mountStoryAnnotations({
                storyAnnotations: [
                    {
                        annotationCellId: "p1",
                        title: "The door",
                        description: "She finds the door.",
                        passages: [
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
                storyAnnotationSelected: { annotationCellId: "p1", passage: 0 },
                listsThePassagesNewestFirst,
            });

            const passagesShown = [
                ...document.querySelectorAll(
                    ".authorship-panel-story-annotation-passage-shown",
                ),
            ].map((passage) => passage.getAttribute("aria-pressed"));
            expect(passagesShown).toEqual(passagesMarked);
        },
    );

    it("asks for a passage's words to be taken out of the annotation", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
            ],
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });
        const removeButton = document.querySelector(
            ".authorship-panel-story-annotation-passage-removed",
        )!;

        await click(removeButton);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeStoryWordRange",
                commandArguments: {
                    annotationCellId: "p1",
                    firstWord: 2,
                    lastWord: 3,
                },
            },
        ]);
    });

    it("cannot assign anything until words are selected", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [],
                },
            ],
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });

        const assignButton = document.querySelector<HTMLButtonElement>(
            ".authorship-panel-story-annotation-assign",
        )!;
        expect(assignButton.disabled).toBe(true);
    });

    it("asks for the selected words to be assigned to the selected annotation", async () => {
        await mountStoryAnnotations({
            storyAnnotations: [
                {
                    annotationCellId: "p1",
                    title: "The door",
                    description: "She finds the door.",
                    passages: [],
                },
            ],
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
            storyTextSelected: {
                cellId: "m1",
                startCharacterOffsetInCell: 4,
                endCharacterOffsetInCell: 8,
            },
        });
        const assignButton = document.querySelector(
            ".authorship-panel-story-annotation-assign",
        )!;

        await click(assignButton);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "assignStoryText",
                commandArguments: {
                    annotationCellId: "p1",
                    cellId: "m1",
                    startCharacterOffsetInCell: 4,
                    endCharacterOffsetInCell: 8,
                },
            },
        ]);
    });
});
