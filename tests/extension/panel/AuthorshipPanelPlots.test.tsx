import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type {
    PlotInTheStory,
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

const { AuthorshipPanelPlots } = await import(
    "../../../extension/webview/panel/AuthorshipPanelPlots"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("the plots tab", () => {
    let posted: unknown[] = [];
    let root: Root;

    interface WhatTheTabIsGiven {
        plots: PlotInTheStory[] | null;
        plotSelected?: string | null;
        passageSelected?: number | null;
        storyTextSelected?: StoryTextSpan | null;
    }

    async function mountPlots(options: WhatTheTabIsGiven): Promise<void> {
        posted = [];
        monacoEditorsOnThePage.length = 0;
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await redrawPlots(options);
    }

    async function redrawPlots(options: WhatTheTabIsGiven): Promise<void> {
        await act(async () => {
            root.render(
                <AuthorshipPanelPlots
                    plots={options.plots}
                    plotSelected={options.plotSelected ?? null}
                    passageSelected={options.passageSelected ?? null}
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
        await mountPlots({ plots: null });

        expect(document.body.textContent).toBe("No manuscript open");
    });

    it.each([
        { story: "none yet", plots: [] },
        {
            story: "one already",
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [],
                },
            ],
        },
    ])(
        "asks for a new plot to be added when the story holds $story",
        async ({ plots }) => {
            await mountPlots({ plots });
            const addButton = document.querySelector(
                'button[aria-label="Add a plot"]',
            )!;

            await click(addButton);

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "addPlot",
                    commandArguments: {},
                },
            ]);
        },
    );

    it("lists every plot by its title", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
                {
                    plotCellId: "p2",
                    title: "The bell",
                    abstract: "He hears the bell.",
                    trajectory: [],
                },
            ],
        });

        const titlesListed = [
            ...document.querySelectorAll(".authorship-panel-plot-title"),
        ].map((title) => title.textContent);
        expect(titlesListed).toEqual(["The door", "The bell"]);
    });

    it("asks the host to select the plot clicked", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [],
                },
                {
                    plotCellId: "p2",
                    title: "The bell",
                    abstract: "He hears the bell.",
                    trajectory: [],
                },
            ],
        });
        const secondTitle = document.querySelectorAll(
            ".authorship-panel-plot-title",
        )[1];

        await click(secondTitle);

        expect(posted).toEqual([{ type: "selectPlot", plotCellId: "p2" }]);
    });

    it("asks the host to let go of the selected plot when it is clicked again", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [],
                },
                {
                    plotCellId: "p2",
                    title: "The bell",
                    abstract: "He hears the bell.",
                    trajectory: [],
                },
            ],
            plotSelected: "p1",
        });
        const firstTitle = document.querySelector(
            ".authorship-panel-plot-title",
        )!;

        await click(firstTitle);

        expect(posted).toEqual([{ type: "selectPlot", plotCellId: null }]);
    });

    it("shows the selected plot's title, abstract and trajectory below the list", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
                {
                    plotCellId: "p2",
                    title: "The bell",
                    abstract: "He hears the bell.",
                    trajectory: [],
                },
            ],
            plotSelected: "p1",
        });

        const titleShown = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!.value;
        const abstractShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        const spanShown = document.querySelector(
            ".authorship-panel-plot-span-shown",
        )?.textContent;
        expect(titleShown).toBe("The door");
        expect(abstractShown).toBe("She finds the door.");
        expect(spanShown).toBe("the door.");
    });

    it("asks for the title to be replaced as the author types it", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [],
                },
            ],
            plotSelected: "p1",
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

    it("tells the host the abstract the author types", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [],
                },
            ],
            plotSelected: "p1",
        });
        const abstractRendered = document.querySelector(".markdown-rendered")!;

        await act(async () => {
            abstractRendered.dispatchEvent(
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

    it("shows the abstract the host rewrote, as after an undo", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [],
                },
            ],
            plotSelected: "p1",
        });

        await redrawPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She opens the door.",
                    trajectory: [],
                },
            ],
            plotSelected: "p1",
        });

        const abstractShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        expect(abstractShown).toBe("She opens the door.");
    });

    it("asks for the plot whose bin is pressed to be deleted", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [],
                },
                {
                    plotCellId: "p2",
                    title: "The bell",
                    abstract: "He hears the bell.",
                    trajectory: [],
                },
            ],
        });
        const secondBin = document.querySelectorAll(
            ".authorship-panel-plot-deleted",
        )[1];

        await click(secondBin);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "deletePlot",
                commandArguments: { plotCellId: "p2" },
            },
        ]);
    });

    it("counts the spans of each plot's trajectory in a column beside its title", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [
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
                    plotCellId: "p2",
                    title: "The bell",
                    abstract: "He hears the bell.",
                    trajectory: [],
                },
            ],
        });

        const spansCounted = [
            ...document.querySelectorAll(".authorship-panel-plot-spans-count"),
        ].map((count) => count.textContent);
        expect(spansCounted).toEqual(["2", "0"]);
    });

    it("lists the trajectory's spans in the order of the trajectory", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [
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
            plotSelected: "p1",
        });

        const spansListed = [
            ...document.querySelectorAll(".authorship-panel-plot-span-shown"),
        ].map((span) => span.textContent);
        expect(spansListed).toEqual(["the door.", "the bell."]);
    });

    it("asks the host to select the passage of the span clicked, and to show its words", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [
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
            plotSelected: "p1",
        });
        const secondSpan = document.querySelectorAll(
            ".authorship-panel-plot-span-shown",
        )[1];

        await click(secondSpan);

        expect(posted).toEqual([
            { type: "selectPassage", passageSelected: 1 },
            { type: "showStoryWordRange", firstWord: 6, lastWord: 7 },
        ]);
    });

    it("marks the passage selected", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [
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
            plotSelected: "p1",
            passageSelected: 0,
        });

        const spansMarked = [
            ...document.querySelectorAll(".authorship-panel-plot-span-shown"),
        ].map((span) => span.getAttribute("aria-pressed"));
        expect(spansMarked).toEqual(["true", "false"]);
    });

    it("asks for a span's words to be taken out of the trajectory", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [
                        {
                            firstWord: 2,
                            lastWord: 3,
                            cellId: "c2",
                            wordsItCovers: "the door.",
                        },
                    ],
                },
            ],
            plotSelected: "p1",
        });
        const removeButton = document.querySelector(
            ".authorship-panel-plot-span-removed",
        )!;

        await click(removeButton);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeStoryWordRangeFromThePlot",
                commandArguments: {
                    plotCellId: "p1",
                    firstWord: 2,
                    lastWord: 3,
                },
            },
        ]);
    });

    it("cannot add to the trajectory until words are selected", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [],
                },
            ],
            plotSelected: "p1",
        });

        const assignButton = document.querySelector<HTMLButtonElement>(
            ".authorship-panel-plot-assign",
        )!;
        expect(assignButton.disabled).toBe(true);
    });

    it("asks for the selected words to be added to the selected plot's trajectory", async () => {
        await mountPlots({
            plots: [
                {
                    plotCellId: "p1",
                    title: "The door",
                    abstract: "She finds the door.",
                    trajectory: [],
                },
            ],
            plotSelected: "p1",
            storyTextSelected: {
                cellId: "m1",
                startCharacterOffsetInCell: 4,
                endCharacterOffsetInCell: 8,
            },
        });
        const assignButton = document.querySelector(
            ".authorship-panel-plot-assign",
        )!;

        await click(assignButton);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "assignStoryTextToThePlot",
                commandArguments: {
                    plotCellId: "p1",
                    cellId: "m1",
                    startCharacterOffsetInCell: 4,
                    endCharacterOffsetInCell: 8,
                },
            },
        ]);
    });
});
