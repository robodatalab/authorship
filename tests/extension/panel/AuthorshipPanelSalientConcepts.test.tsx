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

const { AuthorshipPanelSalientConcepts } = await import(
    "../../../extension/webview/panel/AuthorshipPanelSalientConcepts"
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

const THE_DOOR_ON_BOTH_PASSAGES = `<!-- cell: salient-concept id="k1" title="The door" words="2-3, 6-7" -->

She finds the door.
`;

const THE_DOOR_ON_ITS_PASSAGE = `<!-- cell: salient-concept id="k1" title="The door" words="2-3" -->

She finds the door.
`;

describe("the salient concepts tab", () => {
    let posted: unknown[] = [];
    let root: Root;

    interface WhatTheTabIsGiven {
        story: string | null;
        storyAnnotationSelected?: StoryAnnotationSelected;
        storyTextSelected?: StoryTextSpan | null;
    }

    async function mountSalientConcepts(options: WhatTheTabIsGiven): Promise<void> {
        posted = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await act(async () => {
            root.render(
                <AuthorshipPanelSalientConcepts
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

    it("says so when no manuscript is open", async () => {
        await mountSalientConcepts({ story: null });

        expect(document.body.textContent).toBe("No manuscript open");
    });

    it("shows the selected concept's title, description and references below the list", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_ITS_PASSAGE].join("\n"),
            storyAnnotationSelected: { annotationCellId: "k1", passage: null },
        });

        const titleShown = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!.value;
        const descriptionShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        const referenceShown = document.querySelector(
            ".authorship-panel-story-annotation-passage-shown",
        )?.textContent;
        expect(titleShown).toBe("The door");
        expect(descriptionShown).toBe("She finds the door.");
        expect(referenceShown).toBe("the door.");
    });

    it("asks for the concept's title to be replaced as the author types it", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR].join("\n"),
            storyAnnotationSelected: { annotationCellId: "k1", passage: null },
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
            storyAnnotationSelected: { annotationCellId: "k1", passage: null },
        });

        const referencesShown = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-passage-shown",
            ),
        ].map((reference) => reference.textContent);
        expect(referencesShown).toEqual(["the bell.", "the door."]);
    });

    it("asks the host to select the second reference listed, and to show its words", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "k1", passage: null },
        });
        const secondReference = document.querySelectorAll(
            ".authorship-panel-story-annotation-passage-shown",
        )[1];

        await click(secondReference);

        expect(posted).toEqual([
            { type: "selectPassage", cellKind: "salient-concept", passage: 0 },
            { type: "showStoryWordRange", firstWord: 2, lastWord: 3 },
        ]);
    });

    it("marks the reference selected", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_BOTH_PASSAGES].join("\n"),
            storyAnnotationSelected: { annotationCellId: "k1", passage: 0 },
        });

        const referencesMarked = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-passage-shown",
            ),
        ].map((reference) => reference.getAttribute("aria-pressed"));
        expect(referencesMarked).toEqual(["false", "true"]);
    });

    it("asks for a reference's words to be taken out of the concept", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR_ON_ITS_PASSAGE].join("\n"),
            storyAnnotationSelected: { annotationCellId: "k1", passage: null },
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
                    annotationCellId: "k1",
                    firstWord: 2,
                    lastWord: 3,
                },
            },
        ]);
    });

    it("cannot assign anything until words are selected", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR].join("\n"),
            storyAnnotationSelected: { annotationCellId: "k1", passage: null },
        });

        const assignButton = document.querySelector<HTMLButtonElement>(
            ".authorship-panel-story-annotation-assign",
        )!;
        expect(assignButton.disabled).toBe(true);
    });

    it("asks for the selected words to be assigned to the selected concept", async () => {
        await mountSalientConcepts({
            story: [THE_STORY, THE_DOOR].join("\n"),
            storyAnnotationSelected: { annotationCellId: "k1", passage: null },
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
                    annotationCellId: "k1",
                    cellId: "m1",
                    startCharacterOffsetInCell: 4,
                    endCharacterOffsetInCell: 8,
                },
            },
        ]);
    });
});
