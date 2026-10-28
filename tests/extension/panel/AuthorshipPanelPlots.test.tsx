import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import type { StoryAnnotationSelected } from "../../../extension/vscode_runtime/story_annotation_selection";
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

const { AuthorshipPanelPlots } = await import(
    "../../../extension/webview/panel/AuthorshipPanelPlots"
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

const THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT = `<!-- cell: plot id="p1" title="The door" edges="x1:e1>e2" -->

<ol title="She finds the door.">
<li id="e1" timestamp="1.1" location="the hall" words="2-3">She finds the door.</li>
<li id="e2" timestamp="1.2" location="the hall">She opens the door.</li>
</ol>
`;

describe("the plots tab", () => {
    let posted: unknown[] = [];
    let root: Root;

    interface WhatTheTabIsGiven {
        story: string | null;
        storyAnnotationSelected?: StoryAnnotationSelected;
        storyTextSelected?: StoryTextSpan | null;
    }

    async function mountPlots(options: WhatTheTabIsGiven): Promise<void> {
        posted = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await act(async () => {
            root.render(
                <AuthorshipPanelPlots
                    story={
                        options.story === null ? null : new Document(options.story)
                    }
                    storyAnnotationSelected={
                        options.storyAnnotationSelected ?? {
                            annotationCellId: null,
                            passageId: null,
                        }
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

    it("says so when no manuscript is open", async () => {
        await mountPlots({ story: null });

        expect(document.body.textContent).toBe("No manuscript open");
    });

    it("shows the selected plot's title, description and trajectory below the list", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_ITS_PASSAGE].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });

        const titleShown = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!.value;
        const descriptionShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        const nodeShown = document.querySelector(
            ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
        )?.textContent;
        expect(titleShown).toBe("The door");
        expect(descriptionShown).toBe("She finds the door.");
        expect(nodeShown).toBe("the door.");
    });

    it("asks for the plot's title to be replaced as the author types it", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
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
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });

        const eventsShown = [
            ...document.querySelectorAll(
                ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
            ),
        ].map((event) => [event.textContent, event.getAttribute("title")]);
        expect(eventsShown).toEqual([
            ["She finds the door.", "1.1 · the hall · the door."],
            ["She opens the door.", "1.2 · the hall · Not told in the story yet"],
        ]);
    });

    it("asks only for an event the story does not tell yet to be selected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const eventUntold = document.querySelectorAll(
            ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
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
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
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

    describe("the event selected", () => {
        function eventFieldsShown(): string[] {
            return [
                ...document.querySelectorAll<HTMLInputElement>(
                    ".authorship-panel-plot-event .author-file-editor-cell-field-input",
                ),
            ].map((field) => field.value);
        }

        async function type(field: HTMLInputElement, said: string): Promise<void> {
            const setTheValue = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )!.set!;
            await act(async () => {
                setTheValue.call(field, said);
                field.dispatchEvent(new Event("input", { bubbles: true }));
            });
        }

        it("is shown with its title, timestamp, location and the words that tell it", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                storyAnnotationSelected: { annotationCellId: "p1", passageId: "e1" },
            });

            const wordsShown = document.querySelector(
                ".authorship-panel-plot-event .authorship-panel-story-annotation-passage-shown",
            )?.textContent;
            expect(eventFieldsShown()).toEqual(["She finds the door.", "1.1", "the hall"]);
            expect(wordsShown).toBe("the door.");
        });

        it("is not shown when no event is selected", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
            });

            expect(document.querySelector(".authorship-panel-plot-event")).toBeNull();
        });

        it("says so when the story does not tell it yet", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                storyAnnotationSelected: { annotationCellId: "p1", passageId: "e2" },
            });

            const said = document.querySelector(
                ".authorship-panel-plot-event .authorship-panel-plot-event-untold",
            )?.textContent;
            const deleteTheStoryText = document.querySelector(
                ".authorship-panel-plot-event .authorship-panel-story-annotation-passage-removed",
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
                storyAnnotationSelected: { annotationCellId: "p1", passageId: "e1" },
            });

            const placeholders = [
                ...document.querySelectorAll<HTMLInputElement>(
                    ".authorship-panel-plot-event .author-file-editor-cell-field-input",
                ),
            ].map((field) => field.placeholder);
            expect(placeholders).toEqual([
                "",
                "Story time",
                "Location in the story, comma separated",
            ]);
        });

        it.each([
            ["title", 0, "summary", "She finds the red door."],
            ["timestamp", 1, "timestamp", "2.1"],
            ["location", 2, "location", "the hall, by the stairs"],
        ])(
            "asks for the event's %s, and only that, to be changed as the author types it",
            async (_, index, field, said) => {
                await mountPlots({
                    story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                    storyAnnotationSelected: { annotationCellId: "p1", passageId: "e1" },
                });
                const fieldTyped = document.querySelectorAll<HTMLInputElement>(
                    ".authorship-panel-plot-event .author-file-editor-cell-field-input",
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
                storyAnnotationSelected: { annotationCellId: "p1", passageId: "e1" },
            });
            const takeTheWordsAway = document.querySelector(
                ".authorship-panel-plot-event .authorship-panel-story-annotation-passage-removed",
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
                storyAnnotationSelected: { annotationCellId: "p1", passageId: "e2" },
                storyTextSelected: {
                    cellId: "c3",
                    startCharacterOffsetInCell: 3,
                    endCharacterOffsetInCell: 8,
                },
            });
            const tellTheEvent = document.querySelector(
                ".authorship-panel-plot-event .authorship-panel-story-annotation-assign",
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

        it("cannot be told with words until words are selected", async () => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
                storyAnnotationSelected: { annotationCellId: "p1", passageId: "e2" },
            });

            const tellTheEvent = document.querySelector<HTMLButtonElement>(
                ".authorship-panel-plot-event .authorship-panel-story-annotation-assign",
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
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });

        const eventNamed = document.querySelector(
            ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
        )?.textContent;
        expect(eventNamed).toBe(named);
    });

    it("lists the trajectory in the order it is written", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });

        const nodesShown = [
            ...document.querySelectorAll(
                ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
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
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });

        expect(reactSaid).not.toHaveBeenCalled();
    });

    it("asks the host to select the second node of the trajectory, and to show its words", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const secondNode = document.querySelectorAll(
            ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
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
            storyAnnotationSelected: { annotationCellId: "p1", passageId: "n1" },
        });

        const nodesMarked = [
            ...document.querySelectorAll(
                ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
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
                storyAnnotationSelected: {
                    annotationCellId: "p1",
                    passageId: "n2",
                },
            });

            const nodesShownMarked = [
                ...document.querySelectorAll(
                    ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
                ),
            ].map((node) => node.getAttribute("aria-pressed"));
            expect(nodesShownMarked).toEqual(nodesMarked);
        },
    );

    it("asks for a node to be taken out of the trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const secondRemoveButton = document.querySelectorAll(
            ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-removed",
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
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
            "3f1c0e2a-0000-4000-8000-000000000001",
        );
        const addButton = document.querySelector(
            ".authorship-panel-story-annotation-assign",
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
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
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
        { droppedOn: "its row", target: ".authorship-panel-story-annotation-passage" },
        { droppedOn: "its node", target: ".authorship-panel-plot-trajectory-node" },
    ])(
        "asks for the node dragged from to be connected to the node dropped on $droppedOn",
        async ({ target }) => {
            await mountPlots({
                story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
                storyAnnotationSelected: {
                    annotationCellId: "p1",
                    passageId: null,
                },
            });
            const secondNode = document.querySelectorAll(
                ".authorship-panel-plot-trajectory-node",
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
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const firstNode = document.querySelectorAll(
            ".authorship-panel-plot-trajectory-node",
        )[0];

        await press(firstNode);
        await letGo(firstNode);

        expect(posted).toEqual([]);
    });

    it("connects nothing once a drag was let go outside the trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const firstNode = document.querySelectorAll(
            ".authorship-panel-plot-trajectory-node",
        )[0];
        const secondRow = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage",
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
                storyAnnotationSelected: {
                    annotationCellId: "p1",
                    passageId: null,
                },
            });
            const rows = document.querySelectorAll(
                ".authorship-panel-story-annotation-passage",
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
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const firstRow = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage",
        )[0];

        await startDragging(firstRow);
        await dragOver(firstRow);
        await dropOn(firstRow);

        expect(posted).toEqual([]);
    });

    it("moves nothing once a row was dropped outside the trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const rows = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage",
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
                storyAnnotationSelected: {
                    annotationCellId: "p1",
                    passageId: null,
                },
            });
            const rows = document.querySelectorAll(
                ".authorship-panel-story-annotation-passage",
            );

            await startDragging(rows[dragged]);
            await dragOver(rows[draggedOver]);

            const nodesShownWhileDragging = [
                ...document.querySelectorAll(
                    ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
                ),
            ].map((node) => node.textContent);
            expect(nodesShownWhileDragging).toEqual(nodesShown);
        },
    );

    it("marks only the row dragged, where it lands, while dragging", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const rows = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage",
        );

        await startDragging(rows[0]);
        await dragOver(rows[1]);

        const rowsMarked = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-passage",
            ),
        ].map((row) =>
            row.classList.contains("authorship-panel-plot-trajectory-row-dragged"),
        );
        expect(rowsMarked).toEqual([false, true]);
    });

    it("marks no row once the drag ends", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const rows = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage",
        );

        await startDragging(rows[0]);
        await dragOver(rows[1]);
        await stopDragging(rows[0]);

        const rowsMarked = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-passage",
            ),
        ].map((row) =>
            row.classList.contains("authorship-panel-plot-trajectory-row-dragged"),
        );
        expect(rowsMarked).toEqual([false, false]);
    });

    it("redraws the lines for where the node lands while dragging", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_LEADING_TO_THE_BELL].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const rows = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage",
        );

        await startDragging(rows[0]);
        await dragOver(rows[1]);

        const arrowheadDrawn = document
            .querySelector(".authorship-panel-plot-trajectory-edge-arrowhead")
            ?.getAttribute("d");
        expect(arrowheadDrawn).toBe("M 3.5 24.5 L 10.5 24.5 L 7 19.5 Z");
    });

    it("puts the node back once the drag is let go outside the trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const rows = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage",
        );

        await startDragging(rows[0]);
        await dragOver(rows[1]);
        await stopDragging(rows[0]);

        const nodesShown = [
            ...document.querySelectorAll(
                ".authorship-panel-plot-trajectory .authorship-panel-story-annotation-passage-shown",
            ),
        ].map((node) => node.textContent);
        expect(nodesShown).toEqual(["the door.", "the bell."]);
    });

    it("asks for the nodes whose line is clicked to be disconnected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_LEADING_TO_THE_BELL].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passageId: null },
        });
        const edge = document.querySelector(
            ".authorship-panel-plot-trajectory-edge",
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
                storyAnnotationSelected: {
                    annotationCellId: "p1",
                    passageId: null,
                },
            });

            const arrowheadDrawn = document
                .querySelector(".authorship-panel-plot-trajectory-edge-arrowhead")
                ?.getAttribute("d");
            expect(arrowheadDrawn).toBe(arrowhead);
        },
    );
});
