import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { AuthorshipPanelSalientConcepts } from "../../../extension/webview/panel/AuthorshipPanelSalientConcepts";
import type {
    SalientConceptInTheStory,
    StoryTextSpan,
} from "../../../extension/vscode_runtime/storydoc/story_words";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("the salient concepts tab", () => {
    let posted: unknown[] = [];

    async function mountSalientConcepts(options: {
        salientConcepts: SalientConceptInTheStory[] | null;
        salientConceptSelected?: string | null;
        storyTextSelected?: StoryTextSpan | null;
    }): Promise<void> {
        posted = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        await act(async () => {
            createRoot(container).render(
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
                ".authorship-panel-salient-concept-title-box",
            )!.value,
        ).toBe("Door");
        expect(
            document.querySelector<HTMLTextAreaElement>(
                ".authorship-panel-salient-concept-description",
            )!.value,
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
            ".authorship-panel-salient-concept-title-box",
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
        const descriptionBox = document.querySelector<HTMLTextAreaElement>(
            ".authorship-panel-salient-concept-description",
        )!;

        await act(async () => {
            Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype,
                "value",
            )!.set!.call(descriptionBox, "What she opened.");
            descriptionBox.dispatchEvent(new Event("input", { bubbles: true }));
        });

        expect(posted).toEqual([
            { type: "typed", cellId: "k1", markdown: "What she opened." },
        ]);
    });

    it("asks for the selected concept to be deleted", async () => {
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

        await click(
            document.querySelector(".authorship-panel-salient-concept-deleted")!,
        );

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "deleteCell",
                commandArguments: { cellId: "k1" },
            },
        ]);
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
        });

        expect(
            document.querySelector<HTMLButtonElement>(
                ".authorship-panel-salient-concept-assign",
            )!.disabled,
        ).toBe(true);
    });

    it("asks for the selected words to be assigned to a concept", async () => {
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
