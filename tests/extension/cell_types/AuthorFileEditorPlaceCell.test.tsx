import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import type { PlaceCell } from "authordoc/cells/place_cell";

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

const { AuthorFileEditorPlaceCell } = await import(
    "../../../extension/webview/cell_types/AuthorFileEditorPlaceCell"
);
const { MarkdownEditorMediator } = await import(
    "../../../extension/webview/markdown/MarkdownEditor"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const THE_PLACES = `<!-- cell: place id="en" title="England" -->

<!-- cell: place id="hv" title="Hollowmere" parent="en" -->

A village of weavers.

<!-- cell: place id="ln" title="The lane" parent="hv" -->

<!-- cell: place id="hg" title="Harrowgate" -->
`;

describe("a place cell", () => {
    let posted: unknown[] = [];
    let root: Root;

    async function mountThePlace(placeId: string): Promise<void> {
        posted = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        const story = new Document(THE_PLACES);
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <AuthorFileEditorPlaceCell
                        cell={story.cellWithId(placeId) as PlaceCell}
                        sendMessagesToVscode={(message) => posted.push(message)}
                    />
                </MarkdownEditorMediator>,
            );
        });
    }

    it("keeps its parent when it is renamed", async () => {
        await mountThePlace("hv");
        const nameBox = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!;
        const setTheValue = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )!.set!;

        await act(async () => {
            setTheValue.call(nameBox, "Hollowmere village");
            nameBox.dispatchEvent(new Event("input", { bubbles: true }));
        });

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "replaceCell",
                commandArguments: {
                    cell: '<!-- cell: place id="hv" title="Hollowmere village" parent="en" -->\n\nA village of weavers.\n',
                },
            },
        ]);
    });
});
