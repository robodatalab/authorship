import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { AuthorFileEditorProvider } from "../../extension/author_editor/author_file_editor_provider";
import { Uri, files } from "./vscode";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const DOCUMENT_PATH = "/stories/expat_pet.author";

interface OpenEditor {
    fileDocument: { text: string };
    edits: { undo(): void; redo(): void }[];
}

async function openEditor(text: string): Promise<OpenEditor> {
    files.clear();
    files.set(DOCUMENT_PATH, text);

    const provider = new AuthorFileEditorProvider({
        extensionUri: Uri.file("/extension"),
    } as never);
    const edits: { undo(): void; redo(): void }[] = [];
    provider.onDidChangeCustomDocument((edit) =>
        edits.push(edit as unknown as { undo(): void; redo(): void }),
    );

    const fileDocument = await provider.openCustomDocument(
        Uri.file(DOCUMENT_PATH) as never,
        {} as never,
    );

    let receive: (message: unknown) => void = () => undefined;
    const panel = {
        webview: {
            options: {},
            html: "",
            cspSource: "vscode-resource:",
            asWebviewUri: (uri: unknown) => uri,
            postMessage: (message: unknown) => {
                window.dispatchEvent(new MessageEvent("message", { data: message }));
                return Promise.resolve(true);
            },
            onDidReceiveMessage: (listener: (message: unknown) => void) => {
                receive = listener;
                return { dispose: () => undefined };
            },
        },
        onDidDispose: () => ({ dispose: () => undefined }),
    };
    provider.resolveCustomEditor(fileDocument, panel as never);

    document.body.innerHTML = '<div id="author-file-editor-root"></div>';
    (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
        postMessage: (message: unknown) => receive(message),
    });
    vi.resetModules();
    await act(async () => {
        await import("../../extension/cell_types/MarkdownCell");
        await import("../../extension/author_file_editor_webview");
    });

    return {
        fileDocument: fileDocument as unknown as { text: string },
        edits,
    };
}

async function addMarkdownCellAtTheTop(): Promise<void> {
    const menu = document.querySelector(".author-file-editor-insert-cell-menu")!;
    await act(async () => {
        menu.querySelector("button")!.dispatchEvent(
            new MouseEvent("click", { bubbles: true }),
        );
    });
}

async function undo(editor: OpenEditor): Promise<void> {
    await act(async () => {
        editor.edits[editor.edits.length - 1].undo();
    });
}

function cellsInTheFile(editor: OpenEditor): number {
    return editor.fileDocument.text.split("<!-- cell:").length - 1;
}

function cellsOnThePage(): number {
    return document.querySelectorAll(".author-file-editor-cell").length;
}

let editor: OpenEditor;

beforeEach(async () => {
    editor = await openEditor("one\n");
});

describe("undoing after two cells were added", () => {
    it("takes one of the two out of the file", async () => {
        await addMarkdownCellAtTheTop();
        await addMarkdownCellAtTheTop();
        expect(cellsInTheFile(editor)).toBe(3);

        await undo(editor);

        expect(cellsInTheFile(editor)).toBe(2);
    });

    it("takes one of the two off the page", async () => {
        await addMarkdownCellAtTheTop();
        await addMarkdownCellAtTheTop();
        expect(cellsOnThePage()).toBe(3);

        await undo(editor);

        expect(cellsOnThePage()).toBe(2);
    });
});
