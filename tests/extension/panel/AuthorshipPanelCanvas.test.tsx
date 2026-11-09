import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import type { StoryGeneration } from "../../../extension/vscode_runtime/story_generation";

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

const { AuthorshipPanelCanvas } = await import(
    "../../../extension/webview/panel/AuthorshipPanelCanvas"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const THE_STORY = `<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

She finds the door.
`;

const ASKS_FOR_THE_CONCEPTS: StoryGeneration = {
    running: true,
    error: null,
    progress: { steps: [{ doing: "concepts", done: 0, of: 2 }] },
    asked: {
        number: 1,
        story: null,
        shown: {
            kind: "command",
            cellKind: "salient-concept",
            commandName: "addStoryAnnotation",
        },
    },
};

const ASKS_FOR_A_REVIEW_OF_A_PLOT: StoryGeneration = {
    running: true,
    error: null,
    progress: { steps: [{ doing: "plots", done: 1, of: 3 }] },
    asked: {
        number: 2,
        story: THE_STORY,
        shown: {
            kind: "annotation",
            cellKind: "plot",
            annotationCellId: "p1",
            passageId: null,
        },
    },
};

describe("the panel while a story is generated", () => {
    let root: Root;

    afterEach(() => act(() => root.unmount()));

    async function mountThePanel(storyGeneration: StoryGeneration): Promise<void> {
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await act(async () => {
            root.render(
                <AuthorshipPanelCanvas
                    story={new Document(THE_STORY)}
                    storyGeneration={storyGeneration}
                    sendMessagesToVscode={() => undefined}
                />,
            );
        });
    }

    it("opens the tab of the plot it shows", async () => {
        await mountThePanel(ASKS_FOR_A_REVIEW_OF_A_PLOT);

        const plotsTab = document.querySelector('[aria-label="Plots"]')!;
        expect(plotsTab.getAttribute("aria-selected")).toBe("true");
    });

    it("highlights the button the author is to press", async () => {
        await mountThePanel(ASKS_FOR_THE_CONCEPTS);

        const addAConcept = document.querySelector(
            '[aria-label="Add a salient concept"]',
        )!;
        expect(
            addAConcept.classList.contains(
                "authorship-panel-toolbar-button-highlighted",
            ),
        ).toBe(true);
    });
});
