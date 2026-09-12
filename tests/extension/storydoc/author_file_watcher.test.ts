import { beforeEach, describe, expect, it } from "vitest";

import { AuthorFileEditorProvider } from "../../../extension/vscode_runtime/author_file_editor_provider";
import { Uri, files, watchersOnTheFiles, window as vscodeWindow } from "../vscode";

const DOCUMENT_PATH = "/stories/expat_pet.author";

interface OpenEditor {
    typeIntoTheCell(cellId: string, markdown: string): Promise<void>;
    theAuthorIsEditingTheCell(cellId: string | null): Promise<void>;
    save(): Promise<void>;
    theFileWasWrittenElsewhere(text: string): Promise<void>;
    theCellsOnThePage(): string[];
    documentsSentToThePage(): number;
}

async function openEditor(text: string): Promise<OpenEditor> {
    files.clear();
    files.set(DOCUMENT_PATH, text);
    watchersOnTheFiles.length = 0;

    const provider = new AuthorFileEditorProvider(
        { extensionUri: Uri.file("/extension") } as never,
        vscodeWindow.createOutputChannel("Authorship") as never,
    );
    const session = await provider.openCustomDocument(
        Uri.file(DOCUMENT_PATH) as never,
        {} as never,
    );

    const documentsSentToThePage: { source: string }[][] = [];
    let cellsOnThePage: { attrs: Record<string, string>; source: string }[] =
        [];
    let receiveFromThePage: (message: unknown) => void = () => undefined;
    const panel = {
        webview: {
            options: {},
            html: "",
            cspSource: "vscode-resource:",
            asWebviewUri: (uri: unknown) => uri,
            postMessage: (message: {
                type: string;
                cells?: { attrs: Record<string, string>; source: string }[];
            }) => {
                if (message.type === "document" && message.cells) {
                    documentsSentToThePage.push(message.cells);
                    cellsOnThePage = message.cells;
                } else if (message.type === "cells" && message.cells) {
                    const changed = message.cells;
                    documentsSentToThePage.push(changed);
                    cellsOnThePage = cellsOnThePage.map(
                        (drawing) =>
                            changed.find(
                                (cell) => cell.attrs.id === drawing.attrs.id,
                            ) ?? drawing,
                    );
                }
                return Promise.resolve(true);
            },
            onDidReceiveMessage: (listener: (message: unknown) => void) => {
                receiveFromThePage = listener;
                return { dispose: () => undefined };
            },
        },
        onDidDispose: () => ({ dispose: () => undefined }),
    };
    provider.resolveCustomEditor(session, panel as never);
    receiveFromThePage({ type: "ready" });
    await new Promise((settled) => setTimeout(settled, 0));

    return {
        typeIntoTheCell: async (cellId: string, markdown: string) => {
            cellsOnThePage = cellsOnThePage.map((drawing) =>
                drawing.attrs.id === cellId
                    ? { ...drawing, source: markdown }
                    : drawing,
            );
            receiveFromThePage({ type: "typed", cellId, markdown });
            await new Promise((settled) => setTimeout(settled, 0));
        },
        theAuthorIsEditingTheCell: async (cellId: string | null) => {
            receiveFromThePage({ type: "editing", cellId });
            await new Promise((settled) => setTimeout(settled, 0));
        },
        theFileWasWrittenElsewhere: async (text: string) => {
            files.set(DOCUMENT_PATH, text);
            await watchersOnTheFiles[0].theFileChanged();
            await new Promise((settled) => setTimeout(settled, 0));
        },
        theCellsOnThePage: () => cellsOnThePage.map((cell) => cell.source),
        save: () => provider.saveCustomDocument(session),
        documentsSentToThePage: () => documentsSentToThePage.length,
    };
}

const TWO_CELLS = [
    '<!-- cell: markdown id="one" -->',
    "",
    "The lantern",
    "",
    '<!-- cell: markdown id="two" -->',
    "",
    "The door",
    "",
].join("\n");

function theFileNowReads(one: string, two: string): string {
    return [
        '<!-- cell: markdown id="one" -->',
        "",
        one,
        "",
        '<!-- cell: markdown id="two" -->',
        "",
        two,
        "",
    ].join("\n");
}

let editor: OpenEditor;

beforeEach(async () => {
    editor = await openEditor(TWO_CELLS);
});

describe("the watcher on the author file, when the editor saves it itself", () => {
    it("says nothing to the page, the file holding what the document holds", async () => {
        await editor.typeIntoTheCell("one", "The lantern went out\n");
        await editor.save();
        const sentBeforeTheWatcherFired = editor.documentsSentToThePage();

        await watchersOnTheFiles[0].theFileChanged();
        await new Promise((settled) => setTimeout(settled, 0));

        expect(editor.documentsSentToThePage()).toBe(
            sentBeforeTheWatcherFired,
        );
    });
});

describe("the watcher on the author file, when somebody else writes it", () => {
    it("takes the whole file when no cell is being edited", async () => {
        await editor.theFileWasWrittenElsewhere(
            theFileNowReads("A lantern", "A door"),
        );

        expect(editor.theCellsOnThePage()).toEqual(["A lantern", "A door"]);
    });

    it("leaves the cell being edited as the author has it and takes the rest", async () => {
        await editor.theAuthorIsEditingTheCell("one");
        await editor.typeIntoTheCell("one", "The lantern went out");

        await editor.theFileWasWrittenElsewhere(
            theFileNowReads("A lantern", "A door"),
        );

        expect(editor.theCellsOnThePage()).toEqual([
            "The lantern went out",
            "A door",
        ]);
    });

    it("takes that cell too once the author has left it", async () => {
        await editor.theAuthorIsEditingTheCell("one");
        await editor.typeIntoTheCell("one", "The lantern went out");
        await editor.theAuthorIsEditingTheCell(null);

        await editor.theFileWasWrittenElsewhere(
            theFileNowReads("A lantern", "A door"),
        );

        expect(editor.theCellsOnThePage()).toEqual(["A lantern", "A door"]);
    });
});
