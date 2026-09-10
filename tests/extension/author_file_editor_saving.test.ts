import { beforeEach, describe, expect, it } from "vitest";

import { AuthorFileEditorProvider } from "../../extension/vscode_runtime/author_file_editor_provider";
import { Uri, files, watchersOnTheFiles } from "./vscode";

const DOCUMENT_PATH = "/stories/expat_pet.author";

interface OpenEditor {
    typeIntoTheCell(markdown: string): Promise<void>;
    save(): Promise<void>;
    theCellOnThePage(): string | undefined;
    documentsSentToThePage(): number;
}

async function openEditor(text: string): Promise<OpenEditor> {
    files.clear();
    files.set(DOCUMENT_PATH, text);
    watchersOnTheFiles.length = 0;

    const provider = new AuthorFileEditorProvider({
        extensionUri: Uri.file("/extension"),
    } as never);
    const session = await provider.openCustomDocument(
        Uri.file(DOCUMENT_PATH) as never,
        {} as never,
    );

    const documentsSentToThePage: { source: string }[][] = [];
    let receiveFromThePage: (message: unknown) => void = () => undefined;
    const panel = {
        webview: {
            options: {},
            html: "",
            cspSource: "vscode-resource:",
            asWebviewUri: (uri: unknown) => uri,
            postMessage: (message: {
                type: string;
                cells?: { source: string }[];
            }) => {
                if (message.type === "document" && message.cells) {
                    documentsSentToThePage.push(message.cells);
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

    const cellId = (session as unknown as { document: { cells: { attrs: Record<string, string> }[] } })
        .document.cells[0].attrs.id;

    return {
        typeIntoTheCell: async (markdown: string) => {
            receiveFromThePage({
                type: "invoke",
                commandName: "replaceMarkdown",
                commandArguments: { cellId, markdown },
            });
            await new Promise((settled) => setTimeout(settled, 0));
        },
        save: () => provider.saveCustomDocument(session),
        theCellOnThePage: () =>
            documentsSentToThePage[documentsSentToThePage.length - 1]?.[0]
                ?.source,
        documentsSentToThePage: () => documentsSentToThePage.length,
    };
}

let editor: OpenEditor;

beforeEach(async () => {
    editor = await openEditor("<!-- cell: markdown -->\n\nThe lantern\n");
});

describe("the editor's own save reaching its watcher on the file", () => {
    it("does not put back what the file held when the author has typed on", async () => {
        await editor.typeIntoTheCell("The lantern w");
        await editor.save();
        await editor.typeIntoTheCell("The lantern wa");

        await watchersOnTheFiles[0].theFileChanged();
        await new Promise((settled) => setTimeout(settled, 0));

        expect(editor.theCellOnThePage()).toBe("The lantern wa");
    });

    it("says nothing to the page, the file holding what the document holds", async () => {
        await editor.typeIntoTheCell("The lantern went out\n");
        await editor.save();
        const sentBeforeTheWatcherFired = editor.documentsSentToThePage();

        await watchersOnTheFiles[0].theFileChanged();
        await new Promise((settled) => setTimeout(settled, 0));

        expect(editor.documentsSentToThePage()).toBe(
            sentBeforeTheWatcherFired,
        );
    });
});
