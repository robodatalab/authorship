import { describe, expect, it, vi, type Mock } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import type { PlotCell } from "authordoc/cells/plot_cell";
import { StoryWordRangeInTheStory } from "authordoc/iterators/story_annotations_iterator";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";
import type { WebviewAuthorDocumentCommandCard } from "../../../extension/webview/author_editor/AuthorFileEditorCanvas";

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

const { AuthorFileEditorPlotEvent } = await import(
    "../../../extension/webview/cell_types/AuthorFileEditorPlotEvent"
);
const { AuthorFileEditorCellState } = await import(
    "../../../extension/webview/author_editor/AuthorFileEditorCell"
);
const { MarkdownEditorMediator } = await import(
    "../../../extension/webview/markdown/MarkdownEditor"
);
const { monacoEditorsOnThePage } = await import(
    "../markdown/monaco_editor_double"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT = `<!-- cell: markdown id="c2" -->

She saw the door.

<!-- cell: place id="h1" title="The hall" -->

<!-- cell: place id="h2" title="The stairs" -->

<!-- cell: character id="v1" title="Varn" -->

<!-- cell: character id="d1" title="Lia" -->

<!-- cell: plot id="p1" title="The door" edges="x1:e1>e2" -->

<ol title="She finds the door.">
<li id="e1" timestamp="1.1" place="h1" characters="v1" words="2-3">She finds the door.</li>
<li id="e2" timestamp="1.2" place="h1">She opens the door.</li>
</ol>
`;

describe("the event of a plot", () => {
    let posted: unknown[] = [];
    let onSelected: Mock;
    let onDragStarted: Mock;
    let onDragEnded: Mock;

    interface WhatTheEventIsGiven {
        story: string;
        nodeId: string;
        passage: StoryWordRangeInTheStory | null;
        isSelected?: boolean;
        storyTextSelected?: StoryTextSpan | null;
        plotCellCommands?: WebviewAuthorDocumentCommandCard[];
    }

    async function mountTheEvent(given: WhatTheEventIsGiven): Promise<void> {
        posted = [];
        onSelected = vi.fn();
        onDragStarted = vi.fn();
        onDragEnded = vi.fn();
        monacoEditorsOnThePage.length = 0;
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        const story = new Document(given.story);
        const plotCell = story.cellWithId("p1") as PlotCell;
        const plotNode = plotCell.getNodeById(given.nodeId);
        function sendToTheHost(message: unknown): void {
            posted.push(message);
        }
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <AuthorFileEditorCellState
                        cellCommands={given.plotCellCommands ?? []}
                        cellId="p1"
                        cellIsFolded={false}
                        timesTheHostWroteIt={0}
                        sendMessagesToVscode={sendToTheHost}
                    >
                        <AuthorFileEditorPlotEvent
                            story={story}
                            plotCellId="p1"
                            plotNode={plotNode}
                            passage={given.passage}
                            isSelected={given.isSelected ?? false}
                            storyTextSelected={given.storyTextSelected ?? null}
                            onSelected={onSelected}
                            onDragStarted={onDragStarted}
                            onDragEnded={onDragEnded}
                            sendMessagesToVscode={sendToTheHost}
                        />
                    </AuthorFileEditorCellState>
                </MarkdownEditorMediator>,
            );
        });
    }

    async function dispatch(element: Element, eventType: string): Promise<void> {
        const event = new MouseEvent(eventType, { bubbles: true });
        await act(async () => {
            element.dispatchEvent(event);
        });
    }

    async function type(field: HTMLInputElement, said: string): Promise<void> {
        const setTheValue = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )!.set!;
        const typed = new Event("input", { bubbles: true });
        await act(async () => {
            setTheValue.call(field, said);
            field.dispatchEvent(typed);
        });
    }

    it("is drawn as a cell headed Event", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });

        const header = document.querySelector(
            ".author-file-editor-plot-event .author-file-editor-cell .author-file-editor-cell-header",
        )?.textContent;
        expect(header).toBe("Event");
    });

    it("shows its summary in its body", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });

        const summaryShown = document.querySelector(
            ".author-file-editor-plot-event .author-file-editor-cell-body .markdown-rendered p",
        )?.textContent;
        expect(summaryShown).toBe("She finds the door.");
    });

    it("asks for its summary, and only that, to be changed as the author types it", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });
        const summaryRendered = document.querySelector(
            ".author-file-editor-plot-event .markdown-rendered",
        )!;

        await dispatch(summaryRendered, "dblclick");
        await act(async () => {
            monacoEditorsOnThePage[0].putTheCursorAt(19);
            monacoEditorsOnThePage[0].typeCharacter("!");
        });

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "changePlotEvent",
                commandArguments: {
                    annotationCellId: "p1",
                    nodeId: "e1",
                    field: "summary",
                    said: "She finds the door.!",
                },
            },
        ]);
    });

    it("is shown with its timestamp and the words that tell it", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });

        const timestampShown = document.querySelector<HTMLInputElement>(
            ".author-file-editor-plot-event .author-file-editor-cell-field-input",
        )?.value;
        const wordsShown = document.querySelector(
            ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-shown",
        )?.textContent;
        expect(timestampShown).toBe("1.1");
        expect(wordsShown).toBe("the door.");
    });

    it("says what goes in its timestamp before anything is written in it", async () => {
        await mountTheEvent({
            story: '<!-- cell: plot id="p1" title="The door" -->\n\n<ol>\n<li id="e1"></li>\n</ol>\n',
            nodeId: "e1",
            passage: null,
        });

        const placeholder = document.querySelector<HTMLInputElement>(
            ".author-file-editor-plot-event .author-file-editor-cell-field-input",
        )?.placeholder;
        expect(placeholder).toBe("Story time");
    });

    it("asks for its timestamp, and only that, to be changed as the author types it", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });
        const timestampBox = document.querySelector<HTMLInputElement>(
            ".author-file-editor-plot-event .author-file-editor-cell-field-input",
        )!;

        await type(timestampBox, "2.1");

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "changePlotEvent",
                commandArguments: {
                    annotationCellId: "p1",
                    nodeId: "e1",
                    field: "timestamp",
                    said: "2.1",
                },
            },
        ]);
    });

    it("says so when the story does not tell it yet", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e2",
            passage: null,
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

    it("asks to be selected, and for its words to be shown, when they are clicked", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });
        const words = document.querySelector(
            ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-shown",
        )!;

        await dispatch(words, "click");

        expect(onSelected).toHaveBeenCalledOnce();
        expect(posted).toEqual([
            { type: "showStoryWordRange", firstWord: 2, lastWord: 3 },
        ]);
    });

    it("asks for the event's words to be taken away from it", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });
        const takeTheWordsAway = document.querySelector(
            ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-removed",
        )!;

        await dispatch(takeTheWordsAway, "click");

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeStoryTextFromPlotEvent",
                commandArguments: { annotationCellId: "p1", nodeId: "e1" },
            },
        ]);
    });

    it("asks for the selected words to tell it", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e2",
            passage: null,
            storyTextSelected: {
                cellId: "c3",
                startCharacterOffsetInCell: 3,
                endCharacterOffsetInCell: 8,
            },
        });
        const tellTheEvent = document.querySelector(
            ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-assign",
        )!;

        await dispatch(tellTheEvent, "click");

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
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e2",
            passage: null,
        });

        const tellTheEvent = document.querySelector<HTMLButtonElement>(
            ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-assign",
        )!;
        expect(tellTheEvent.disabled).toBe(true);
    });

    it.each([
        ["the place it happens in", ".author-file-editor-plot-event-place", ["The hall"]],
        ["the characters in it", ".author-file-editor-plot-event-characters", ["Varn"]],
    ])("shows %s by name", async (_, referencesShown, expected) => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
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
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });
        const chooseButton = document.querySelector(
            `${referencesShown} .author-file-editor-cell-reference-chosen`,
        )!;

        await dispatch(chooseButton, "click");

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
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });
        const chooseButton = document.querySelector(
            `${referencesShown} .author-file-editor-cell-reference-chosen`,
        )!;
        await dispatch(chooseButton, "click");
        const chosen = document.querySelector(
            `${referencesShown} .author-file-editor-cell-references-to-choose .author-file-editor-story-annotation-passage-shown`,
        )!;

        await dispatch(chosen, "click");

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
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });
        const takeOut = document.querySelector(
            `${referencesShown} .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-removed`,
        )!;

        await dispatch(takeOut, "click");

        expect(posted).toEqual([asked]);
    });

    it("offers in its menu only what moves it or takes it out, none of the plot's commands", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
            plotCellCommands: [
                {
                    commandName: "deleteCell",
                    buttonGroup: "cell",
                    iconClassName: "codicon codicon-trash",
                    tooltip: "Delete the section",
                },
            ],
        });

        const offered = [
            ...document.querySelectorAll(
                ".author-file-editor-plot-event .author-file-editor-cell-actions [aria-label]",
            ),
        ].map((action) => action.getAttribute("aria-label"));
        expect(offered).toEqual([
            "Drag to move",
            "Take this event out of the trajectory",
        ]);
    });

    it("asks to be taken out of the trajectory", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e2",
            passage: null,
        });
        const takeItOut = document.querySelector(
            ".author-file-editor-plot-event [aria-label='Take this event out of the trajectory']",
        )!;

        await dispatch(takeItOut, "click");

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeNodeFromPlot",
                commandArguments: { annotationCellId: "p1", nodeId: "e2" },
            },
        ]);
    });

    it("hands the drag on when dragged by its grip, and its end when let go", async () => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
        });
        const grip = document.querySelector(
            ".author-file-editor-plot-event .author-file-editor-cell-drag-handle",
        )!;

        await dispatch(grip, "dragstart");
        await dispatch(grip, "dragend");

        expect(onDragStarted).toHaveBeenCalledOnce();
        expect(onDragEnded).toHaveBeenCalledOnce();
    });

    it.each([
        { selected: "selected", isSelected: true, marked: true },
        { selected: "not selected", isSelected: false, marked: false },
    ])("is marked so while $selected", async ({ isSelected, marked }) => {
        await mountTheEvent({
            story: THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT,
            nodeId: "e1",
            passage: new StoryWordRangeInTheStory("e1", 2, 3, "c2", "the door."),
            isSelected,
        });

        const isMarked = document
            .querySelector(".author-file-editor-plot-event")!
            .classList.contains("author-file-editor-plot-event-selected");
        expect(isMarked).toBe(marked);
    });
});
