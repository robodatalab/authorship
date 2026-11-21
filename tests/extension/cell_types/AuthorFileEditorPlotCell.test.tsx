import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import type { PlotCell } from "authordoc/cells/plot_cell";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";

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

const { AuthorFileEditorPlotCell } = await import(
    "../../../extension/webview/cell_types/AuthorFileEditorPlotCell"
);
const { MarkdownEditorMediator } = await import(
    "../../../extension/webview/markdown/MarkdownEditor"
);
const { monacoEditorsOnThePage } = await import(
    "../markdown/monaco_editor_double"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const THE_STORY = `<!-- cell: markdown id="c2" -->

She saw the door.

<!-- cell: markdown id="c3" -->

He heard the bell.
`;

const THE_DOOR = `<!-- cell: plot id="p1" title="The door" -->

She finds the door.
`;

const THE_DOOR_ON_BOTH_PASSAGES = `<!-- cell: plot id="p1" title="The door" nodes="n1:2-3, n2:6-7" -->

She finds the door.
`;

const THE_DOOR_LEADING_TO_THE_BELL = `<!-- cell: plot id="p1" title="The door" nodes="n1:2-3, n2:6-7" edges="e1:n1>n2" -->

She finds the door.
`;

const THE_DOOR_ON_ITS_PASSAGE = `<!-- cell: plot id="p1" title="The door" nodes="n1:2-3" -->

She finds the door.
`;

const THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT = `<!-- cell: place id="h1" title="The hall" -->

<!-- cell: place id="h2" title="The stairs" -->

<!-- cell: character id="v1" title="Varn" -->

<!-- cell: character id="d1" title="Lia" -->

<!-- cell: plot id="p1" title="The door" edges="x1:e1>e2" -->

<ol title="She finds the door.">
<li id="e1" timestamp="1.1" place="h1" characters="v1" words="2-3">She finds the door.</li>
<li id="e2" timestamp="1.2" place="h1">She opens the door.</li>
</ol>
`;

const MOTHERHOOD = `<!-- cell: salient-concept id="k1" title="Motherhood" -->

A mother puts her child first.
`;

const THE_PROMISE = `<!-- cell: salient-concept id="k2" title="The promise" -->

A promise is kept whatever it costs.
`;

const THE_DOOR_REFERENCING_MOTHERHOOD = `<!-- cell: plot id="p1" title="The door" concepts="k1" -->

She finds the door.
`;

const THE_DOOR_REFERENCING_BOTH_CONCEPTS = `<!-- cell: plot id="p1" title="The door" concepts="k1, k2" -->

She finds the door.
`;

describe("a plot cell", () => {
    let posted: unknown[] = [];
    let root: Root;

    interface WhatTheCellIsGiven {
        story: string;
        isShownInTheManuscript?: boolean;
        eventIdSelected?: string | null;
        storyTextSelected?: StoryTextSpan | null;
    }

    async function mountPlots(options: WhatTheCellIsGiven): Promise<void> {
        posted = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        const story = new Document(options.story);
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <AuthorFileEditorPlotCell
                        cell={story.cellWithId("p1") as PlotCell}
                        story={story}
                        isShownInTheManuscript={
                            options.isShownInTheManuscript ?? false
                        }
                        eventIdSelected={options.eventIdSelected ?? null}
                        storyTextSelected={options.storyTextSelected ?? null}
                        sendMessagesToVscode={(message) => posted.push(message)}
                    />
                </MarkdownEditorMediator>,
            );
        });
    }

    async function click(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
    }

    async function press(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(
                new MouseEvent("mousedown", { bubbles: true }),
            );
        });
    }

    async function letGo(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        });
    }

    async function startDragging(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(
                new MouseEvent("dragstart", { bubbles: true }),
            );
        });
    }

    async function dragOver(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(
                new MouseEvent("dragenter", { bubbles: true }),
            );
        });
    }

    async function dropOn(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(new MouseEvent("drop", { bubbles: true }));
        });
    }

    async function stopDragging(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(new MouseEvent("dragend", { bubbles: true }));
        });
    }

    it("shows the plot's title, overview and trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_ITS_PASSAGE].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });

        const titleShown = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!.value;
        const descriptionShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        const nodeShown = document.querySelector(
            ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
        )?.textContent;
        expect(titleShown).toBe("The door");
        expect(descriptionShown).toBe("She finds the door.");
        expect(nodeShown).toBe("the door.");
    });

    it("asks for the plot's title to be replaced as the author types it", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
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
                commandName: "replaceCell",
                commandArguments: {
                    cell: '<!-- cell: plot id="p1" title="The doors" -->\n\n<ol title="She finds the door.">\n</ol>\n',
                },
            },
        ]);
    });

    it("lists every event by its summary, the story telling it or not", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });

        const eventsShown = [
            ...document.querySelectorAll(
                ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
            ),
        ].map((event) => [event.textContent, event.getAttribute("title")]);
        expect(eventsShown).toEqual([
            ["She finds the door.", "1.1 · The hall · the door."],
            ["She opens the door.", "1.2 · The hall · Not told in the story yet"],
        ]);
    });

    it("asks only for an event the story does not tell yet to be selected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const eventUntold = document.querySelectorAll(
            ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
        )[1];

        await click(eventUntold);

        expect(posted).toEqual([
            { type: "selectPassage", cellKind: "plot", passageId: "e2" },
        ]);
    });

    it("asks for the plot's overview, and only that, to be changed as the author types it", async () => {
        monacoEditorsOnThePage.length = 0;
        await mountPlots({
            story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
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
            {
                type: "invoke",
                commandName: "redescribePlot",
                commandArguments: {
                    annotationCellId: "p1",
                    overview: "She finds the door.!",
                },
            },
        ]);
    });

    it("keeps the concepts the plot references when it is retitled", async () => {
        await mountPlots({
            story: [THE_STORY, MOTHERHOOD, THE_DOOR_REFERENCING_MOTHERHOOD].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
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
                commandName: "replaceCell",
                commandArguments: {
                    cell: '<!-- cell: plot id="p1" title="The doors" concepts="k1" -->\n\n<ol title="She finds the door.">\n</ol>\n',
                },
            },
        ]);
    });

    describe("the plot's concepts", () => {
        it("lists the concepts the plot references by their titles", async () => {
            await mountPlots({
                story: [THE_STORY, MOTHERHOOD, THE_PROMISE, THE_DOOR_REFERENCING_MOTHERHOOD].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });

            const conceptsShown = Array.from(
                document.querySelectorAll(
                    ".author-file-editor-plot-concepts .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-shown",
                ),
                (concept) => concept.textContent,
            );
            expect(conceptsShown).toEqual(["Motherhood"]);
        });

        it("asks for a concept to stop being referenced", async () => {
            await mountPlots({
                story: [THE_STORY, MOTHERHOOD, THE_PROMISE, THE_DOOR_REFERENCING_MOTHERHOOD].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });
            const removeButton = document.querySelector(
                ".author-file-editor-plot-concepts .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-removed",
            )!;

            await click(removeButton);

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "removeConceptFromPlot",
                    commandArguments: {
                        annotationCellId: "p1",
                        conceptCellId: "k1",
                    },
                },
            ]);
        });

        it("offers only the concepts the plot does not reference yet", async () => {
            await mountPlots({
                story: [THE_STORY, MOTHERHOOD, THE_PROMISE, THE_DOOR_REFERENCING_MOTHERHOOD].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });
            const chooseButton = document.querySelector(
                ".author-file-editor-plot-concepts .author-file-editor-cell-reference-chosen",
            )!;

            await click(chooseButton);

            const conceptsOffered = Array.from(
                document.querySelectorAll(
                    ".author-file-editor-plot-concepts .author-file-editor-cell-references-to-choose .author-file-editor-story-annotation-passage-shown",
                ),
                (concept) => concept.textContent,
            );
            expect(conceptsOffered).toEqual(["The promise"]);
        });

        it("asks for the concept chosen to be referenced, and stops offering", async () => {
            await mountPlots({
                story: [THE_STORY, MOTHERHOOD, THE_PROMISE, THE_DOOR_REFERENCING_MOTHERHOOD].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });
            const chooseButton = document.querySelector(
                ".author-file-editor-plot-concepts .author-file-editor-cell-reference-chosen",
            )!;
            await click(chooseButton);
            const thePromise = document.querySelector(
                ".author-file-editor-plot-concepts .author-file-editor-cell-references-to-choose .author-file-editor-story-annotation-passage-shown",
            )!;

            await click(thePromise);

            const offering = document.querySelector(
                ".author-file-editor-plot-concepts .author-file-editor-cell-references-to-choose",
            );
            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "addConceptToPlot",
                    commandArguments: {
                        annotationCellId: "p1",
                        conceptCellId: "k2",
                    },
                },
            ]);
            expect(offering).toBeNull();
        });

        it("offers nothing to reference once the plot references every concept", async () => {
            await mountPlots({
                story: [THE_STORY, MOTHERHOOD, THE_PROMISE, THE_DOOR_REFERENCING_BOTH_CONCEPTS].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });

            const chooseButton = document.querySelector<HTMLButtonElement>(
                ".author-file-editor-plot-concepts .author-file-editor-cell-reference-chosen",
            )!;
            expect(chooseButton.disabled).toBe(true);
        });
    });

    describe("the event selected", () => {
        function eventFieldsShown(): string[] {
            return [
                ...document.querySelectorAll<HTMLInputElement>(
                    ".author-file-editor-plot-event .author-file-editor-cell-field-input",
                ),
            ].map((field) => field.value);
        }

        async function type(
            field: HTMLInputElement | HTMLTextAreaElement,
            said: string,
        ): Promise<void> {
            const setTheValue = Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(field),
                "value",
            )!.set!;
            await act(async () => {
                setTheValue.call(field, said);
                field.dispatchEvent(new Event("input", { bubbles: true }));
            });
        }

        it("is shown with its summary, timestamp and the words that tell it", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e1",
            });

            const wordsShown = document.querySelector(
                ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-shown",
            )?.textContent;
            expect(eventFieldsShown()).toEqual(["She finds the door.", "1.1"]);
            expect(wordsShown).toBe("the door.");
        });

        it("shows its summary, labelled so, in a box of many lines", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e1",
            });

            const [summaryField] = document.querySelectorAll(
                ".author-file-editor-plot-event .author-file-editor-cell-field",
            );
            const label = summaryField.querySelector(
                ".author-file-editor-cell-field-label",
            )?.textContent;
            const box = summaryField.querySelector(
                ".author-file-editor-cell-field-input",
            )?.tagName;
            expect(label).toBe("Summary");
            expect(box).toBe("TEXTAREA");
        });

        it("is not shown when no event is selected", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });

            expect(document.querySelector(".author-file-editor-plot-event")).toBeNull();
        });

        it("says so when the story does not tell it yet", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e2",
            });

            const said = document.querySelector(
                ".author-file-editor-plot-event-story-text .author-file-editor-plot-event-untold",
            )?.textContent;
            const deleteTheStoryText = document.querySelector(
                ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-removed",
            );
            expect(said).toBe("Not told in the story yet");
            expect(deleteTheStoryText).toBeNull();
        });

        it("says what goes in each field before anything is written in it", async () => {
            await mountPlots({
                story: [
                    THE_STORY,
                    '<!-- cell: plot id="p1" title="The door" -->\n\n<ol>\n<li id="e1"></li>\n</ol>\n',
                ].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e1",
            });

            const placeholders = [
                ...document.querySelectorAll<HTMLInputElement>(
                    ".author-file-editor-plot-event .author-file-editor-cell-field-input",
                ),
            ].map((field) => field.placeholder);
            expect(placeholders).toEqual(["", "Story time"]);
        });

        it.each([
            ["summary", 0, "summary", "She finds the red door."],
            ["timestamp", 1, "timestamp", "2.1"],
        ])(
            "asks for the event's %s, and only that, to be changed as the author types it",
            async (_, index, field, said) => {
                await mountPlots({
                    story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                    isShownInTheManuscript: true,
                eventIdSelected: "e1",
                });
                const fieldTyped = document.querySelectorAll<HTMLInputElement>(
                    ".author-file-editor-plot-event .author-file-editor-cell-field-input",
                )[index];

                await type(fieldTyped, said);

                expect(posted).toEqual([
                    {
                        type: "invoke",
                        commandName: "changePlotEvent",
                        commandArguments: {
                            annotationCellId: "p1",
                            nodeId: "e1",
                            field,
                            said,
                        },
                    },
                ]);
            },
        );

        it("asks for the event's words to be taken away from it", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e1",
            });
            const takeTheWordsAway = document.querySelector(
                ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-removed",
            )!;

            await click(takeTheWordsAway);

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "removeStoryTextFromPlotEvent",
                    commandArguments: { annotationCellId: "p1", nodeId: "e1" },
                },
            ]);
        });

        it("asks for the selected words to tell it", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e2",
                storyTextSelected: {
                    cellId: "c3",
                    startCharacterOffsetInCell: 3,
                    endCharacterOffsetInCell: 8,
                },
            });
            const tellTheEvent = document.querySelector(
                ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-assign",
            )!;

            await click(tellTheEvent);

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "assignStoryTextToPlotEvent",
                    commandArguments: {
                        annotationCellId: "p1",
                        nodeId: "e2",
                        cellId: "c3",
                        startCharacterOffsetInCell: 3,
                        endCharacterOffsetInCell: 8,
                    },
                },
            ]);
        });

        it.each([
            ["the place it happens in", ".author-file-editor-plot-event-place", ["The hall"]],
            ["the characters in it", ".author-file-editor-plot-event-characters", ["Varn"]],
        ])("shows %s by name", async (_, referencesShown, expected) => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e1",
            });

            const named = [
                ...document.querySelectorAll(
                    `${referencesShown} .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-shown`,
                ),
            ].map((reference) => reference.textContent);
            expect(named).toEqual(expected);
        });

        it.each([
            ["the places other than its own", ".author-file-editor-plot-event-place", ["The stairs"]],
            ["the characters not in it yet", ".author-file-editor-plot-event-characters", ["Lia"]],
        ])("offers %s", async (_, referencesShown, expected) => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e1",
            });
            const chooseButton = document.querySelector(
                `${referencesShown} .author-file-editor-cell-reference-chosen`,
            )!;

            await click(chooseButton);

            const offered = [
                ...document.querySelectorAll(
                    `${referencesShown} .author-file-editor-cell-references-to-choose .author-file-editor-story-annotation-passage-shown`,
                ),
            ].map((reference) => reference.textContent);
            expect(offered).toEqual(expected);
        });

        it.each([
            [
                "the place chosen to be the event's",
                ".author-file-editor-plot-event-place",
                {
                    type: "invoke",
                    commandName: "changePlotEvent",
                    commandArguments: { annotationCellId: "p1", nodeId: "e1", field: "place", said: "h2" },
                },
            ],
            [
                "the character chosen to be put in the event",
                ".author-file-editor-plot-event-characters",
                {
                    type: "invoke",
                    commandName: "addCharacterToPlotEvent",
                    commandArguments: { annotationCellId: "p1", nodeId: "e1", characterCellId: "d1" },
                },
            ],
        ])("asks for %s", async (_, referencesShown, asked) => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e1",
            });
            const chooseButton = document.querySelector(
                `${referencesShown} .author-file-editor-cell-reference-chosen`,
            )!;
            await click(chooseButton);
            const chosen = document.querySelector(
                `${referencesShown} .author-file-editor-cell-references-to-choose .author-file-editor-story-annotation-passage-shown`,
            )!;

            await click(chosen);

            expect(posted).toEqual([asked]);
        });

        it.each([
            [
                "out of its place",
                ".author-file-editor-plot-event-place",
                {
                    type: "invoke",
                    commandName: "changePlotEvent",
                    commandArguments: { annotationCellId: "p1", nodeId: "e1", field: "place", said: "" },
                },
            ],
            [
                "a character out of it",
                ".author-file-editor-plot-event-characters",
                {
                    type: "invoke",
                    commandName: "removeCharacterFromPlotEvent",
                    commandArguments: { annotationCellId: "p1", nodeId: "e1", characterCellId: "v1" },
                },
            ],
        ])("asks for the event to be taken %s", async (_, referencesShown, asked) => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e1",
            });
            const takeOut = document.querySelector(
                `${referencesShown} .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-removed`,
            )!;

            await click(takeOut);

            expect(posted).toEqual([asked]);
        });

        it("cannot be told with words until words are selected", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "e2",
            });

            const tellTheEvent = document.querySelector<HTMLButtonElement>(
                ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-assign",
            )!;
            expect(tellTheEvent.disabled).toBe(true);
        });
    });

    it.each([
        ["its title", '<li id="e1" words="0-3">She finds the door.</li>', "She finds the door."],
        ["the words that tell it, without a title", '<li id="e1" words="0-3"></li>', "She saw the door."],
        [
            "the first few words that tell it, without a title",
            '<li id="e1" words="0-7"></li>',
            "She saw the door. He heard…",
        ],
        ["that it has no title, told by no words", '<li id="e1"></li>', "Untitled event"],
    ])("names an event in the trajectory by %s", async (_, eventWritten, named) => {
        await mountPlots({
            story: [
                THE_STORY,
                `<!-- cell: plot id="p1" title="The door" -->\n\n<ol>\n${eventWritten}\n</ol>\n`,
            ].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });

        const eventNamed = document.querySelector(
            ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
        )?.textContent;
        expect(eventNamed).toBe(named);
    });

    it("lists the trajectory in the order it is written", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });

        const nodesShown = [
            ...document.querySelectorAll(
                ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
            ),
        ].map((node) => node.textContent);
        expect(nodesShown).toEqual(["the door.", "the bell."]);
    });

    it("keeps two nodes holding the same words apart", async () => {
        const reactSaid = vi.spyOn(console, "error");

        await mountPlots({
            story: [
                THE_STORY,
                '<!-- cell: plot id="p1" title="The door" nodes="n1:2-3, n2:2-3" -->\n\nShe finds the door.\n',
            ].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });

        expect(reactSaid).not.toHaveBeenCalled();
    });

    it("asks the host to select the second node of the trajectory, and to show its words", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const secondNode = document.querySelectorAll(
            ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
        )[1];

        await click(secondNode);

        expect(posted).toEqual([
            { type: "selectPassage", cellKind: "plot", passageId: "n2" },
            { type: "showStoryWordRange", firstWord: 6, lastWord: 7 },
        ]);
    });

    it("marks the node selected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: "n1",
        });

        const nodesMarked = [
            ...document.querySelectorAll(
                ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
            ),
        ].map((node) => node.getAttribute("aria-pressed"));
        expect(nodesMarked).toEqual(["true", "false"]);
    });

    it.each([
        {
            trajectory: "once a node above it is taken out",
            nodes: "n2:6-7",
            nodesMarked: ["true"],
        },
        {
            trajectory: "once the node selected is taken out",
            nodes: "n1:2-3",
            nodesMarked: ["false"],
        },
    ])(
        "marks the node selected, and only that node, $trajectory",
        async ({ nodes, nodesMarked }) => {
            await mountPlots({
                story: [
                    THE_STORY,
                    `<!-- cell: plot id="p1" title="The door" nodes="${nodes}" -->\n\nShe finds the door.\n`,
                ].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: "n2",
            });

            const nodesShownMarked = [
                ...document.querySelectorAll(
                    ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
                ),
            ].map((node) => node.getAttribute("aria-pressed"));
            expect(nodesShownMarked).toEqual(nodesMarked);
        },
    );

    it("asks for a node to be taken out of the trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const secondRemoveButton = document.querySelectorAll(
            ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-removed",
        )[1];

        await click(secondRemoveButton);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeNodeFromPlot",
                commandArguments: {
                    annotationCellId: "p1",
                    nodeId: "n2",
                },
            },
        ]);
    });

    it("asks for an untold event to be added, and selected, when no words are selected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
            "3f1c0e2a-0000-4000-8000-000000000001",
        );
        const addButton = document.querySelector(
            ".author-file-editor-story-annotation-assign",
        )!;

        await click(addButton);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "addEventToPlot",
                commandArguments: {
                    annotationCellId: "p1",
                    nodeId: "3f1c0e2a-0000-4000-8000-000000000001",
                },
            },
            {
                type: "selectPassage",
                cellKind: "plot",
                passageId: "3f1c0e2a-0000-4000-8000-000000000001",
            },
        ]);
    });

    it("asks for the selected words to be added to the selected plot", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
            storyTextSelected: {
                cellId: "m1",
                startCharacterOffsetInCell: 4,
                endCharacterOffsetInCell: 8,
            },
        });
        const assignButton = document.querySelector(
            ".author-file-editor-story-annotation-assign",
        )!;

        await click(assignButton);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "assignStoryTextToPlot",
                commandArguments: {
                    annotationCellId: "p1",
                    cellId: "m1",
                    startCharacterOffsetInCell: 4,
                    endCharacterOffsetInCell: 8,
                },
            },
        ]);
    });

    it.each([
        { droppedOn: "its row", target: ".author-file-editor-story-annotation-passage" },
        { droppedOn: "its node", target: ".author-file-editor-plot-trajectory-node" },
    ])(
        "asks for the node dragged from to be connected to the node dropped on $droppedOn",
        async ({ target }) => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });
            const secondNode = document.querySelectorAll(
                ".author-file-editor-plot-trajectory-node",
            )[1];
            const firstTarget = document.querySelectorAll(target)[0];

            await press(secondNode);
            await letGo(firstTarget);

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "addEdgeToPlot",
                    commandArguments: {
                        annotationCellId: "p1",
                        fromNodeId: "n2",
                        toNodeId: "n1",
                    },
                },
            ]);
        },
    );

    it("connects nothing when the drag ends on the node it started from", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const firstNode = document.querySelectorAll(
            ".author-file-editor-plot-trajectory-node",
        )[0];

        await press(firstNode);
        await letGo(firstNode);

        expect(posted).toEqual([]);
    });

    it("connects nothing once a drag was let go outside the trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const firstNode = document.querySelectorAll(
            ".author-file-editor-plot-trajectory-node",
        )[0];
        const secondRow = document.querySelectorAll(
            ".author-file-editor-story-annotation-passage",
        )[1];

        await press(firstNode);
        await letGo(document.body);
        await letGo(secondRow);

        expect(posted).toEqual([]);
    });

    it.each([
        { dragged: 1, droppedOn: 0, nodeId: "n2", inPlaceOfNodeId: "n1" },
        { dragged: 0, droppedOn: 1, nodeId: "n1", inPlaceOfNodeId: "n2" },
    ])(
        "asks for the node on row $dragged to take the place of the node on row $droppedOn",
        async ({ dragged, droppedOn, nodeId, inPlaceOfNodeId }) => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });
            const rows = document.querySelectorAll(
                ".author-file-editor-story-annotation-passage",
            );

            await startDragging(rows[dragged]);
            await dragOver(rows[droppedOn]);
            await dropOn(rows[droppedOn]);

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "moveNodeInPlot",
                    commandArguments: {
                        annotationCellId: "p1",
                        nodeId,
                        inPlaceOfNodeId,
                    },
                },
            ]);
        },
    );

    it("moves nothing when a row is dropped on itself", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const firstRow = document.querySelectorAll(
            ".author-file-editor-story-annotation-passage",
        )[0];

        await startDragging(firstRow);
        await dragOver(firstRow);
        await dropOn(firstRow);

        expect(posted).toEqual([]);
    });

    it("moves nothing once a row was dropped outside the trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const rows = document.querySelectorAll(
            ".author-file-editor-story-annotation-passage",
        );

        await startDragging(rows[0]);
        await dragOver(rows[1]);
        await stopDragging(rows[0]);
        await dropOn(rows[1]);

        expect(posted).toEqual([]);
    });

    it.each([
        {
            dragging: "the first row over the second",
            dragged: 0,
            draggedOver: 1,
            nodesShown: ["the bell.", "the door."],
        },
        {
            dragging: "the second row over the first",
            dragged: 1,
            draggedOver: 0,
            nodesShown: ["the bell.", "the door."],
        },
        {
            dragging: "a row over itself",
            dragged: 0,
            draggedOver: 0,
            nodesShown: ["the door.", "the bell."],
        },
    ])(
        "shows where the node lands while dragging $dragging",
        async ({ dragged, draggedOver, nodesShown }) => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });
            const rows = document.querySelectorAll(
                ".author-file-editor-story-annotation-passage",
            );

            await startDragging(rows[dragged]);
            await dragOver(rows[draggedOver]);

            const nodesShownWhileDragging = [
                ...document.querySelectorAll(
                    ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
                ),
            ].map((node) => node.textContent);
            expect(nodesShownWhileDragging).toEqual(nodesShown);
        },
    );

    it("marks only the row dragged, where it lands, while dragging", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const rows = document.querySelectorAll(
            ".author-file-editor-story-annotation-passage",
        );

        await startDragging(rows[0]);
        await dragOver(rows[1]);

        const rowsMarked = [
            ...document.querySelectorAll(
                ".author-file-editor-story-annotation-passage",
            ),
        ].map((row) =>
            row.classList.contains("author-file-editor-plot-trajectory-row-dragged"),
        );
        expect(rowsMarked).toEqual([false, true]);
    });

    it("marks no row once the drag ends", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const rows = document.querySelectorAll(
            ".author-file-editor-story-annotation-passage",
        );

        await startDragging(rows[0]);
        await dragOver(rows[1]);
        await stopDragging(rows[0]);

        const rowsMarked = [
            ...document.querySelectorAll(
                ".author-file-editor-story-annotation-passage",
            ),
        ].map((row) =>
            row.classList.contains("author-file-editor-plot-trajectory-row-dragged"),
        );
        expect(rowsMarked).toEqual([false, false]);
    });

    it("redraws the lines for where the node lands while dragging", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_LEADING_TO_THE_BELL].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const rows = document.querySelectorAll(
            ".author-file-editor-story-annotation-passage",
        );

        await startDragging(rows[0]);
        await dragOver(rows[1]);

        const arrowheadDrawn = document
            .querySelector(".author-file-editor-plot-trajectory-edge-arrowhead")
            ?.getAttribute("d");
        expect(arrowheadDrawn).toBe("M 3.5 24.5 L 10.5 24.5 L 7 19.5 Z");
    });

    it("puts the node back once the drag is let go outside the trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const rows = document.querySelectorAll(
            ".author-file-editor-story-annotation-passage",
        );

        await startDragging(rows[0]);
        await dragOver(rows[1]);
        await stopDragging(rows[0]);

        const nodesShown = [
            ...document.querySelectorAll(
                ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
            ),
        ].map((node) => node.textContent);
        expect(nodesShown).toEqual(["the door.", "the bell."]);
    });

    it("asks for the nodes whose line is clicked to be disconnected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_LEADING_TO_THE_BELL].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const edge = document.querySelector(
            ".author-file-editor-plot-trajectory-edge",
        )!;

        await click(edge);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeEdgeFromPlot",
                commandArguments: {
                    annotationCellId: "p1",
                    edgeId: "e1",
                },
            },
        ]);
    });

    it.each([
        {
            edge: "to a node written later",
            edges: "e1:n1>n2",
            arrowhead: "M 3.5 19.5 L 10.5 19.5 L 7 24.5 Z",
        },
        {
            edge: "back to a node written earlier",
            edges: "e1:n2>n1",
            arrowhead: "M 3.5 24.5 L 10.5 24.5 L 7 19.5 Z",
        },
    ])(
        "points the line of an edge $edge at the node it reaches",
        async ({ edges, arrowhead }) => {
            await mountPlots({
                story: [
                    THE_STORY,
                    `<!-- cell: plot id="p1" title="The door" nodes="n1:2-3, n2:6-7" edges="${edges}" -->\n\nShe finds the door.\n`,
                ].join("\n"),
                isShownInTheManuscript: true,
                eventIdSelected: null,
            });

            const arrowheadDrawn = document
                .querySelector(".author-file-editor-plot-trajectory-edge-arrowhead")
                ?.getAttribute("d");
            expect(arrowheadDrawn).toBe(arrowhead);
        },
    );

    it.each([
        ["highlighted, while they are not", false, "p1"],
        ["no longer highlighted, while they are", true, null],
    ])("asks for its words in the manuscript to be %s", async (_, isShownInTheManuscript, annotationCellId) => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript,
        });
        const shownInTheManuscript = document.querySelector(
            ".author-file-editor-story-annotation-shown-in-the-manuscript",
        )!;

        await click(shownInTheManuscript);

        expect(posted).toEqual([
            { type: "selectStoryAnnotation", cellKind: "plot", annotationCellId },
        ]);
    });

    it("draws the button that highlights its words in the cell's menu, not next to its title", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: false,
        });

        const inTheMenu = document.querySelectorAll(
            ".author-file-editor-cell-actions [aria-label='Highlight its words in the manuscript']",
        ).length;
        const nextToTheTitle = document.querySelectorAll(
            ".author-file-editor-cell-header [aria-label='Highlight its words in the manuscript']",
        ).length;
        expect([inTheMenu, nextToTheTitle]).toEqual([1, 0]);
    });

    it("asks for its words to be highlighted before an event of it is selected, while they are not", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: false,
        });
        const secondNode = document.querySelectorAll(
            ".author-file-editor-plot-trajectory .author-file-editor-story-annotation-passage-shown",
        )[1];

        await click(secondNode);

        expect(posted).toEqual([
            { type: "selectStoryAnnotation", cellKind: "plot", annotationCellId: "p1" },
            { type: "selectPassage", cellKind: "plot", passageId: "n2" },
            { type: "showStoryWordRange", firstWord: 6, lastWord: 7 },
        ]);
    });


    describe("the plot's main characters", () => {
        const FOLLOWING_VARN = [
            THE_STORY,
            '<!-- cell: character id="v1" title="Varn" -->',
            "",
            '<!-- cell: character id="d1" title="Lia" -->',
            "",
            '<!-- cell: plot id="p1" title="The door" characters="v1" -->',
            "",
            "She finds the door.",
            "",
        ].join("\n");

        it("lists the characters the plot follows by their names", async () => {
            await mountPlots({ story: FOLLOWING_VARN });

            const followed = [
                ...document.querySelectorAll(
                    ".author-file-editor-plot-characters .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-shown",
                ),
            ].map((character) => character.textContent);
            expect(followed).toEqual(["Varn"]);
        });

        it("offers only the characters the plot does not follow yet", async () => {
            await mountPlots({ story: FOLLOWING_VARN });
            const chooseButton = document.querySelector(
                ".author-file-editor-plot-characters .author-file-editor-cell-reference-chosen",
            )!;

            await click(chooseButton);

            const offered = [
                ...document.querySelectorAll(
                    ".author-file-editor-plot-characters .author-file-editor-cell-references-to-choose .author-file-editor-story-annotation-passage-shown",
                ),
            ].map((character) => character.textContent);
            expect(offered).toEqual(["Lia"]);
        });

        it("asks for the character chosen to be followed", async () => {
            await mountPlots({ story: FOLLOWING_VARN });
            await click(
                document.querySelector(
                    ".author-file-editor-plot-characters .author-file-editor-cell-reference-chosen",
                )!,
            );

            await click(
                document.querySelector(
                    ".author-file-editor-plot-characters .author-file-editor-cell-references-to-choose .author-file-editor-story-annotation-passage-shown",
                )!,
            );

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "addCharacterToPlot",
                    commandArguments: { annotationCellId: "p1", characterCellId: "d1" },
                },
            ]);
        });

        it("asks for a character to stop being followed", async () => {
            await mountPlots({ story: FOLLOWING_VARN });

            await click(
                document.querySelector(
                    ".author-file-editor-plot-characters .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-removed",
                )!,
            );

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "removeCharacterFromPlot",
                    commandArguments: { annotationCellId: "p1", characterCellId: "v1" },
                },
            ]);
        });
    });

});
