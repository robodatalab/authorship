import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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

const { AuthorshipPanelStoryAnnotationTitleAndDescription } = await import(
    "../../../extension/webview/panel/AuthorshipPanelStoryAnnotationTitleAndDescription"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("the title and description of a story annotation", () => {
    let posted: unknown[] = [];
    let retitled: string[] = [];
    let root: Root;

    interface WhatThePartIsGiven {
        title: string;
        description: string;
    }

    async function mountTitleAndDescription(
        options: WhatThePartIsGiven,
    ): Promise<void> {
        posted = [];
        retitled = [];
        monacoEditorsOnThePage.length = 0;
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await redrawTitleAndDescription(options);
    }

    async function redrawTitleAndDescription(
        options: WhatThePartIsGiven,
    ): Promise<void> {
        await act(async () => {
            root.render(
                <AuthorshipPanelStoryAnnotationTitleAndDescription
                    annotationCellId="p1"
                    title={options.title}
                    description={options.description}
                    onRetitled={(title) => retitled.push(title)}
                    sendMessagesToVscode={(message) => posted.push(message)}
                />,
            );
        });
    }

    it("shows the annotation's title and description", async () => {
        await mountTitleAndDescription({
            title: "The door",
            description: "She finds the door.",
        });

        const titleShown = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!.value;
        const descriptionShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        expect(titleShown).toBe("The door");
        expect(descriptionShown).toBe("She finds the door.");
    });

    it("hands on the title as the author types it", async () => {
        await mountTitleAndDescription({
            title: "The door",
            description: "She finds the door.",
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

        expect(retitled).toEqual(["The doors"]);
    });

    it("tells the host the description the author types", async () => {
        await mountTitleAndDescription({
            title: "The door",
            description: "She finds the door.",
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
            { type: "typed", cellId: "p1", markdown: "She finds the door.!" },
        ]);
    });

    it("shows the description the host rewrote, as after an undo", async () => {
        await mountTitleAndDescription({
            title: "The door",
            description: "She finds the door.",
        });

        await redrawTitleAndDescription({
            title: "The door",
            description: "She opens the door.",
        });

        const descriptionShown = document.querySelector(
            ".markdown-rendered p",
        )?.textContent;
        expect(descriptionShown).toBe("She opens the door.");
    });
});
