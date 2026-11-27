import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import type { SalientConceptCell } from "authordoc/cells/salient_concept_cell";
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

const { AuthorFileEditorSalientConceptCell } = await import(
    "../../../extension/webview/cell_types/AuthorFileEditorSalientConceptCell"
);
const { AuthorFileEditorSelectionContext } = await import(
    "../../../extension/webview/author_editor/AuthorFileEditorSelectionFence"
);
const { MarkdownEditorMediator } = await import(
    "../../../extension/webview/markdown/MarkdownEditor"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const THE_STORY = `<!-- cell: markdown id="c2" -->

She saw the door.

<!-- cell: markdown id="c3" -->

He heard the bell.
`;

const THE_DOOR = `<!-- cell: salient-concept id="k1" title="The door" -->

She finds the door.
`;

const THE_DOOR_ON_BOTH_PASSAGES = `<!-- cell: salient-concept id="k1" title="The door" words="r1:2-3, r2:6-7" -->

She finds the door.
`;

const THE_DOOR_ON_ITS_PASSAGE = `<!-- cell: salient-concept id="k1" title="The door" words="r1:2-3" -->

She finds the door.
`;

describe("a salient concept cell", () => {
    let posted: unknown[] = [];
    let selected: unknown[] = [];
    let root: Root;

    interface WhatTheCellIsGiven {
        story: string;
        isShownInTheManuscript?: boolean;
        referenceIdSelected?: string | null;
        storyTextSelected?: StoryTextSpan | null;
    }

    async function mountSalientConcepts(options: WhatTheCellIsGiven): Promise<void> {
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
                            "salient-concept": {
                                annotationCellId: options.isShownInTheManuscript
                                    ? "k1"
                                    : null,
                                passageId: options.referenceIdSelected ?? null,
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
                        <AuthorFileEditorSalientConceptCell
                            cell={story.cellWithId("k1") as SalientConceptCell}
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

    it("shows the concept's title, description and references", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_ITS_PASSAGE].join("\n"),
            isShownInTheManuscript: true,
                referenceIdSelected: null,
        });

        const titleShown = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!.value;
        const descriptionShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        const referenceShown = document.querySelector(
            ".author-file-editor-story-annotation-passage-shown",
        )?.textContent;
        expect(titleShown).toBe("The door");
        expect(descriptionShown).toBe("She finds the door.");
        expect(referenceShown).toBe("the door.");
    });

    it("asks for the concept's title to be replaced as the author types it", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR].join("\n"),
            isShownInTheManuscript: true,
                referenceIdSelected: null,
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
                    cell: '<!-- cell: salient-concept id="k1" title="The doors" -->\n\nShe finds the door.\n',
                },
            },
        ]);
    });

    it("lists the references newest first", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                referenceIdSelected: null,
        });

        const referencesShown = [
            ...document.querySelectorAll(
                ".author-file-editor-story-annotation-passage-shown",
            ),
        ].map((reference) => reference.textContent);
        expect(referencesShown).toEqual(["the bell.", "the door."]);
    });

    it("keeps two references to the same words apart", async () => {
        const reactSaid = vi.spyOn(console, "error");

        await mountSalientConcepts({
            story: [
                THE_STORY,
                '<!-- cell: salient-concept id="k1" title="The door" words="r1:2-3, r2:2-3" -->\n',
            ].join("\n"),
            isShownInTheManuscript: true,
                referenceIdSelected: null,
        });

        expect(reactSaid).not.toHaveBeenCalled();
    });

    it("selects the second reference listed, and asks the host to show its words", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                referenceIdSelected: null,
        });
        const secondReference = document.querySelectorAll(
            ".author-file-editor-story-annotation-passage-shown",
        )[1];

        await click(secondReference);

        expect([selected, posted]).toEqual([
            [{ cellKind: "salient-concept", passageId: "r1" }],
            [{ type: "showStoryWordRange", firstWord: 2, lastWord: 3 }],
        ]);
    });

    it("marks the reference selected", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: true,
                referenceIdSelected: "r1",
        });

        const referencesMarked = [
            ...document.querySelectorAll(
                ".author-file-editor-story-annotation-passage-shown",
            ),
        ].map((reference) => reference.getAttribute("aria-pressed"));
        expect(referencesMarked).toEqual(["false", "true"]);
    });

    it.each([
        {
            concept: "once a reference above it is taken out",
            words: "r2:6-7",
            referencesMarked: ["true"],
        },
        {
            concept: "once the reference selected is taken out",
            words: "r1:2-3",
            referencesMarked: ["false"],
        },
    ])(
        "marks the reference selected, and only that reference, $concept",
        async ({ words, referencesMarked }) => {
            await mountSalientConcepts({
                story: [
                    THE_STORY,
                    `<!-- cell: salient-concept id="k1" title="The door" words="${words}" -->\n`,
                ].join("\n"),
                isShownInTheManuscript: true,
                referenceIdSelected: "r2",
            });

            const referencesShownMarked = [
                ...document.querySelectorAll(
                    ".author-file-editor-story-annotation-passage-shown",
                ),
            ].map((reference) => reference.getAttribute("aria-pressed"));
            expect(referencesShownMarked).toEqual(referencesMarked);
        },
    );

    it("asks for a reference to be taken out of the concept", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_ITS_PASSAGE].join("\n"),
            isShownInTheManuscript: true,
                referenceIdSelected: null,
        });
        const removeButton = document.querySelector(
            ".author-file-editor-story-annotation-passage-removed",
        )!;

        await click(removeButton);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeReferenceFromSalientConcept",
                commandArguments: {
                    annotationCellId: "k1",
                    referenceId: "r1",
                },
            },
        ]);
    });

    it("cannot assign anything until words are selected", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR].join("\n"),
            isShownInTheManuscript: true,
                referenceIdSelected: null,
        });

        const assignButton = document.querySelector<HTMLButtonElement>(
            ".author-file-editor-story-annotation-assign",
        )!;
        expect(assignButton.disabled).toBe(true);
    });

    it("asks for the selected words to be assigned to the selected concept", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR].join("\n"),
            isShownInTheManuscript: true,
                referenceIdSelected: null,
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
                commandName: "assignStoryTextToSalientConcept",
                commandArguments: {
                    annotationCellId: "k1",
                    cellId: "m1",
                    startCharacterOffsetInCell: 4,
                    endCharacterOffsetInCell: 8,
                },
            },
        ]);
    });

    it.each([
        ["highlighted, while they are not", false, "k1"],
        ["no longer highlighted, while they are", true, null],
    ])("asks for its words in the manuscript to be %s", async (_, isShownInTheManuscript, annotationCellId) => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript,
        });
        const shownInTheManuscript = document.querySelector(
            ".author-file-editor-story-annotation-shown-in-the-manuscript",
        )!;

        await click(shownInTheManuscript);

        expect([selected, posted]).toEqual([
            [{ cellKind: "salient-concept", annotationCellId }],
            [],
        ]);
    });

    it("draws the button that highlights its words in the cell's menu, not next to its title", async () => {
        await mountSalientConcepts({
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

    it("asks for its words to be highlighted before a reference of it is selected, while they are not", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            isShownInTheManuscript: false,
        });
        const secondReference = document.querySelectorAll(
            ".author-file-editor-story-annotation-passage-shown",
        )[1];

        await click(secondReference);

        expect([selected, posted]).toEqual([
            [
                { cellKind: "salient-concept", annotationCellId: "k1" },
                { cellKind: "salient-concept", passageId: "r1" },
            ],
            [{ type: "showStoryWordRange", firstWord: 2, lastWord: 3 }],
        ]);
    });

});
