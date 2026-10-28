import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AuthorshipPanelStoryAnnotationsList } from "../../../extension/webview/panel/AuthorshipPanelStoryAnnotationsList";
import {
    StoryAnnotationInTheStory,
    StoryWordRangeInTheStory,
} from "authordoc/iterators/story_annotations_iterator";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("the list of a kind of story annotation", () => {
    let posted: unknown[] = [];
    let root: Root;

    interface WhatTheListIsGiven {
        cellKind?: string;
        storyAnnotations: StoryAnnotationInTheStory[];
        annotationShown?: number;
    }

    async function mountStoryAnnotationsList(
        options: WhatTheListIsGiven,
    ): Promise<void> {
        posted = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await act(async () => {
            root.render(
                <AuthorshipPanelStoryAnnotationsList
                    cellKind={options.cellKind ?? "plot"}
                    storyAnnotations={options.storyAnnotations}
                    annotationShown={
                        options.annotationShown === undefined
                            ? undefined
                            : options.storyAnnotations[options.annotationShown]
                    }
                    wording={{
                        addAnAnnotation: "Add a plot",
                        noAnnotationsYet: "No plots yet",
                        deleteTheAnnotation: "Delete this plot",
                        passagesCounted: "Spans",
                    }}
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

    it.each([{ cellKind: "salient-concept" }, { cellKind: "plot" }])(
        "asks for a new $cellKind to be added",
        async ({ cellKind }) => {
            await mountStoryAnnotationsList({ cellKind, storyAnnotations: [] });
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
        await mountStoryAnnotationsList({
            storyAnnotations: [
                new StoryAnnotationInTheStory("p1", "The door", "", []),
                new StoryAnnotationInTheStory("p2", "The bell", "", []),
            ],
        });

        const titlesListed = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-title",
            ),
        ].map((title) => title.textContent);
        expect(titlesListed).toEqual(["The door", "The bell"]);
    });

    it("lists an annotation nobody has titled yet as untitled", async () => {
        await mountStoryAnnotationsList({
            storyAnnotations: [new StoryAnnotationInTheStory("p1", "", "", [])],
        });

        const titlesListed = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-title",
            ),
        ].map((title) => title.textContent);
        expect(titlesListed).toEqual(["Untitled"]);
    });

    it.each([
        {
            clicked: "one not shown",
            annotationShown: undefined,
            clickedTitle: 1,
            annotationCellId: "p2",
        },
        {
            clicked: "the one shown",
            annotationShown: 0,
            clickedTitle: 0,
            annotationCellId: null,
        },
    ])(
        "asks the host to select the annotation clicked, letting go when it clicks $clicked",
        async ({ annotationShown, clickedTitle, annotationCellId }) => {
            await mountStoryAnnotationsList({
                storyAnnotations: [
                    new StoryAnnotationInTheStory("p1", "The door", "", []),
                    new StoryAnnotationInTheStory("p2", "The bell", "", []),
                ],
                annotationShown,
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

    it("asks for the annotation whose bin is pressed to be deleted", async () => {
        await mountStoryAnnotationsList({
            storyAnnotations: [
                new StoryAnnotationInTheStory("p1", "The door", "", []),
                new StoryAnnotationInTheStory("p2", "The bell", "", []),
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
        await mountStoryAnnotationsList({
            storyAnnotations: [
                new StoryAnnotationInTheStory("p1", "The door", "", [
                    new StoryWordRangeInTheStory("n1", 2, 3, "c2", "the door."),
                    new StoryWordRangeInTheStory("n2", 6, 7, "c3", "the bell."),
                ]),
                new StoryAnnotationInTheStory("p2", "The bell", "", []),
            ],
        });

        const passagesCounted = [
            ...document.querySelectorAll(
                ".authorship-panel-story-annotation-passages-count",
            ),
        ].map((count) => count.textContent);
        expect(passagesCounted).toEqual(["2", "0"]);
    });
});
