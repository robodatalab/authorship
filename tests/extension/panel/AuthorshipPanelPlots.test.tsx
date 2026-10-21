import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Document } from "../../../extension/library/storydoc/storydoc";
import type { StoryAnnotationSelected } from "../../../extension/vscode_runtime/story_annotation_selection";
import type { StoryTextSpan } from "../../../extension/library/storydoc/iterators/story_words_iterator";

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
                            passage: null,
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

    it("says so when no manuscript is open", async () => {
        await mountPlots({ story: null });

        expect(document.body.textContent).toBe("No manuscript open");
    });

    it("shows the selected plot's title, description and trajectory below the list", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_ITS_PASSAGE].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });

        const titleShown = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!.value;
        const descriptionShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        const nodeShown = document.querySelector(
            ".authorship-panel-story-annotation-passage-shown",
        )?.textContent;
        expect(titleShown).toBe("The door");
        expect(descriptionShown).toBe("She finds the door.");
        expect(nodeShown).toBe("the door.");
    });

    it("asks for the plot's title to be replaced as the author types it", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR].join("\n"),
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
                commandName: "replaceCell",
                commandArguments: {
                    cell: '<!-- cell: plot id="p1" title="The doors" -->\n\nShe finds the door.\n',
                },
            },
        ]);
    });

    it("lists the trajectory in the order it is written", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });

        const nodesShown = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-passage-shown",
            ),
        ].map((node) => node.textContent);
        expect(nodesShown).toEqual(["the door.", "the bell."]);
    });

    it("asks the host to select the second node of the trajectory, and to show its words", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });
        const secondNode = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage-shown",
        )[1];

        await click(secondNode);

        expect(posted).toEqual([
            { type: "selectPassage", cellKind: "plot", passage: 1 },
            { type: "showStoryWordRange", firstWord: 6, lastWord: 7 },
        ]);
    });

    it("marks the node selected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passage: 0 },
        });

        const nodesMarked = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-passage-shown",
            ),
        ].map((node) => node.getAttribute("aria-pressed"));
        expect(nodesMarked).toEqual(["true", "false"]);
    });

    it("asks for a node's words to be taken out of the trajectory", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });
        const secondRemoveButton = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage-removed",
        )[1];

        await click(secondRemoveButton);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeStoryWordRangeFromPlot",
                commandArguments: {
                    annotationCellId: "p1",
                    firstWord: 6,
                    lastWord: 7,
                },
            },
        ]);
    });

    it("cannot add anything to the trajectory until words are selected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
        });

        const assignButton = document.querySelector<HTMLButtonElement>(
            ".authorship-panel-story-annotation-assign",
        )!;
        expect(assignButton.disabled).toBe(true);
    });

    it("asks for the selected words to be added to the selected plot", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR].join("\n"),
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
                    passage: null,
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
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
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
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
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

    it("asks for the nodes whose line is clicked to be disconnected", async () => {
        await mountPlots({
            story: [THE_STORY, THE_DOOR_LEADING_TO_THE_BELL].join("\n"),
            storyAnnotationSelected: { annotationCellId: "p1", passage: null },
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
                    passage: null,
                },
            });

            const arrowheadDrawn = document
                .querySelector(".authorship-panel-plot-trajectory-edge-arrowhead")
                ?.getAttribute("d");
            expect(arrowheadDrawn).toBe(arrowhead);
        },
    );
});
