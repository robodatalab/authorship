import { afterEach, describe, expect, it, vi } from "vitest";
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
const { AuthorFileEditorSelectionContext } = await import(
    "../../../extension/webview/author_editor/AuthorFileEditorSelectionFence"
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
    let selected: unknown[] = [];
    let root: Root;

    afterEach(() => vi.restoreAllMocks());

    interface WhatTheCellIsGiven {
        story: string;
        isShownInTheManuscript?: boolean;
        eventIdSelected?: string | null;
        storyTextSelected?: StoryTextSpan | null;
    }

    async function mountPlots(options: WhatTheCellIsGiven): Promise<void> {
        posted = [];
        selected = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        const story = new Document(options.story);
        await act(async () => {
            root.render(
                <AuthorFileEditorSelectionContext.Provider
                    value={{
                        storyAnnotationsSelected: {
                            plot: {
                                annotationCellId: options.isShownInTheManuscript
                                    ? "p1"
                                    : null,
                                passageId: options.eventIdSelected ?? null,
                            },
                        },
                        storyTextSelected: options.storyTextSelected ?? null,
                        selectTheStoryAnnotation: (cellKind, annotationCellId) =>
                            selected.push({ cellKind, annotationCellId }),
                        selectThePassage: (cellKind, passageId) =>
                            selected.push({ cellKind, passageId }),
                        selectTheStoryText: (storyTextSelected) =>
                            selected.push(storyTextSelected),
                    }}
                >
                    <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                        <AuthorFileEditorPlotCell
                            cell={story.cellWithId("p1") as PlotCell}
                            story={story}
                            sendMessagesToVscode={(message) => posted.push(message)}
                        />
                    </MarkdownEditorMediator>
                </AuthorFileEditorSelectionContext.Provider>,
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
            ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-shown",
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

    it("asks only for the event whose node is clicked to be selected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_OPENED_BEFORE_THE_STORY_TELLS_IT].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const nodeOfTheEventUntold = document.querySelectorAll(
            ".author-file-editor-plot-trajectory-node",
        )[1];

        await click(nodeOfTheEventUntold);

        expect([selected, posted]).toEqual([
            [{ cellKind: "plot", passageId: "e2" }],
            [],
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

    it("lists the trajectory in the order it is written", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });

        const nodesShown = [
            ...document.querySelectorAll(
                ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-shown",
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

    it("selects the second node of the trajectory, and asks the host to show its words", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: null,
        });
        const wordsOfTheSecondNode = document.querySelectorAll(
            ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-shown",
        )[1];

        await click(wordsOfTheSecondNode);

        expect([selected, posted]).toEqual([
            [{ cellKind: "plot", passageId: "n2" }],
            [{ type: "showStoryWordRange", firstWord: 6, lastWord: 7 }],
        ]);
    });

    it("marks the node selected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                eventIdSelected: "n1",
        });

        const nodesMarked = [
            ...document.querySelectorAll(".author-file-editor-plot-event"),
        ].map((event) =>
            event.classList.contains("author-file-editor-plot-event-selected"),
        );
        expect(nodesMarked).toEqual([true, false]);
    });

    it.each([
        {
            trajectory: "once a node above it is taken out",
            nodes: "n2:6-7",
            nodesMarked: [true],
        },
        {
            trajectory: "once the node selected is taken out",
            nodes: "n1:2-3",
            nodesMarked: [false],
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
                ...document.querySelectorAll(".author-file-editor-plot-event"),
            ].map((event) =>
                event.classList.contains("author-file-editor-plot-event-selected"),
            );
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
            "[aria-label='Take this event out of the trajectory']",
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

        expect([selected, posted]).toEqual([
            [
                {
                    cellKind: "plot",
                    passageId: "3f1c0e2a-0000-4000-8000-000000000001",
                },
            ],
            [
                {
                    type: "invoke",
                    commandName: "addEventToPlot",
                    commandArguments: {
                        annotationCellId: "p1",
                        nodeId: "3f1c0e2a-0000-4000-8000-000000000001",
                    },
                },
            ],
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

    it("asks for the node dragged from to be connected to the node let go on", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
            eventIdSelected: null,
        });
        const nodes = document.querySelectorAll(
            ".author-file-editor-plot-trajectory-node",
        );

        await press(nodes[1]);
        await letGo(nodes[0]);

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
    });

    it("asks for the node dragged to take the place of the node dropped on", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
            eventIdSelected: null,
        });
        const grips = document.querySelectorAll(
            ".author-file-editor-plot-event .author-file-editor-cell-drag-handle",
        );
        const rows = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await startDragging(grips[1]);
        await dragOver(rows[0]);
        await dropOn(rows[0]);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "moveNodeInPlot",
                commandArguments: {
                    annotationCellId: "p1",
                    nodeId: "n2",
                    inPlaceOfNodeId: "n1",
                },
            },
        ]);
    });

    it("redraws the lines for where the node lands while dragging", async () => {
        vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
        await mountPlots({
            story: [THE_STORY, THE_DOOR_LEADING_TO_THE_BELL].join("\n"),
            isShownInTheManuscript: true,
            eventIdSelected: null,
        });
        const grips = document.querySelectorAll(
            ".author-file-editor-plot-event .author-file-editor-cell-drag-handle",
        );
        const rows = document.querySelectorAll(
            ".author-file-editor-reorderable-list-item",
        );

        await startDragging(grips[0]);
        await dragOver(rows[1]);

        const arrowheadDrawn = document
            .querySelector(".author-file-editor-plot-trajectory-edge-arrowhead")
            ?.getAttribute("d");
        expect(arrowheadDrawn).toBe("M 3.5 102.5 L 10.5 102.5 L 7 97.5 Z");
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

        expect([selected, posted]).toEqual([
            [{ cellKind: "plot", annotationCellId }],
            [],
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
        const wordsOfTheSecondNode = document.querySelectorAll(
            ".author-file-editor-plot-event-story-text .author-file-editor-story-annotation-passage-shown",
        )[1];

        await click(wordsOfTheSecondNode);

        expect([selected, posted]).toEqual([
            [
                { cellKind: "plot", annotationCellId: "p1" },
                { cellKind: "plot", passageId: "n2" },
            ],
            [{ type: "showStoryWordRange", firstWord: 6, lastWord: 7 }],
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
