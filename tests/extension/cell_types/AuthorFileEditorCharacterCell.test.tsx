import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Document } from "authordoc/storydoc";
import type { CharacterCell } from "authordoc/cells/character_cell";

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

const { AuthorFileEditorCharacterCell } = await import(
    "../../../extension/webview/cell_types/AuthorFileEditorCharacterCell"
);
const { MarkdownEditorMediator } = await import(
    "../../../extension/webview/markdown/MarkdownEditor"
);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const VARN_FOR_MOTHERHOOD = `<!-- cell: salient-concept id="k1" title="Motherhood" -->

A mother puts her child first.

<!-- cell: salient-concept id="k2" title="The promise" -->

A promise is kept whatever it costs.

<!-- cell: character id="v1" title="Varn" concepts="k1" -->

She left the fleet.
`;

describe("a character cell", () => {
    let posted: unknown[] = [];
    let root: Root;

    async function mountTheCharacter(written: string): Promise<void> {
        posted = [];
        document.body.innerHTML = "";
        const container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        const story = new Document(written);
        await act(async () => {
            root.render(
                <MarkdownEditorMediator onEditingTheCell={() => undefined}>
                    <AuthorFileEditorCharacterCell
                        cell={story.cellWithId("v1") as CharacterCell}
                        story={story}
                        sendMessagesToVscode={(message) => posted.push(message)}
                    />
                </MarkdownEditorMediator>,
            );
        });
    }

    async function click(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
    }

    it("lists the concepts the character supports by their titles", async () => {
        await mountTheCharacter(VARN_FOR_MOTHERHOOD);

        const supported = [
            ...document.querySelectorAll(
                ".author-file-editor-character-concepts .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-shown",
            ),
        ].map((concept) => concept.textContent);
        expect(supported).toEqual(["Motherhood"]);
    });

    it("asks for the concept chosen to be supported", async () => {
        await mountTheCharacter(VARN_FOR_MOTHERHOOD);
        await click(
            document.querySelector(
                ".author-file-editor-character-concepts .author-file-editor-cell-reference-chosen",
            )!,
        );

        await click(
            document.querySelector(
                ".author-file-editor-character-concepts .author-file-editor-cell-references-to-choose .author-file-editor-story-annotation-passage-shown",
            )!,
        );

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "addConceptToCharacter",
                commandArguments: { characterCellId: "v1", conceptCellId: "k2" },
            },
        ]);
    });

    it("shows an X on the button that lists the concepts to choose, while the list is open", async () => {
        await mountTheCharacter(VARN_FOR_MOTHERHOOD);
        const listButton = document.querySelector(
            ".author-file-editor-character-concepts .author-file-editor-cell-reference-chosen",
        )!;

        await click(listButton);

        expect([listButton.getAttribute("aria-label"), listButton.querySelector("i")!.className]).toEqual([
            "Close the list without choosing",
            "codicon codicon-close",
        ]);
    });

    it("closes the concepts to choose when the X is clicked, leaving the concepts the character supports as they are", async () => {
        await mountTheCharacter(VARN_FOR_MOTHERHOOD);
        const listButton = document.querySelector(
            ".author-file-editor-character-concepts .author-file-editor-cell-reference-chosen",
        )!;
        await click(listButton);

        await click(listButton);

        const listed = document.querySelector(
            ".author-file-editor-character-concepts .author-file-editor-cell-references-to-choose",
        );
        const supported = [
            ...document.querySelectorAll(
                ".author-file-editor-character-concepts .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-shown",
            ),
        ].map((concept) => concept.textContent);
        expect([listed, supported, posted]).toEqual([null, ["Motherhood"], []]);
    });

    it("asks for a concept to stop being supported", async () => {
        await mountTheCharacter(VARN_FOR_MOTHERHOOD);

        await click(
            document.querySelector(
                ".author-file-editor-character-concepts .author-file-editor-cell-references-referenced .author-file-editor-story-annotation-passage-removed",
            )!,
        );

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "removeConceptFromCharacter",
                commandArguments: { characterCellId: "v1", conceptCellId: "k1" },
            },
        ]);
    });

    it("keeps the concepts the character supports when it is renamed", async () => {
        await mountTheCharacter(VARN_FOR_MOTHERHOOD);
        const nameBox = document.querySelector<HTMLInputElement>(
            ".author-file-editor-cell-field-input",
        )!;
        const setTheValue = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )!.set!;

        await act(async () => {
            setTheValue.call(nameBox, "Captain Varn");
            nameBox.dispatchEvent(new Event("input", { bubbles: true }));
        });

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "replaceCell",
                commandArguments: {
                    cell: '<!-- cell: character id="v1" title="Captain Varn" concepts="k1" -->\n\nShe left the fleet.\n',
                },
            },
        ]);
    });
});
