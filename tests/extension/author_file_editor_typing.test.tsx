import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { AuthorFileEditorProvider } from "../../extension/vscode_runtime/author_file_editor_provider";
import { Uri, files, watchersOnTheFiles } from "./vscode";

vi.mock(
    "monaco-editor/editor/contrib/multicursor/browser/multicursor.js",
    () => ({}),
);
vi.mock("monaco-editor/languages/definitions/markdown/markdown.js", () => ({
    conf: {},
    language: {},
}));
vi.mock("monaco-editor/editor/editor.api", async () => {
    const { monacoEditorApi } = await import("./markdown/monaco_editor_double");
    return monacoEditorApi();
});

import { monacoEditorsOnThePage } from "./markdown/monaco_editor_double";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const DOCUMENT_PATH = "/stories/expat_pet.author";

const listeningForThePage: [string, EventListenerOrEventListenerObject][] = [];

const answersFromTheHost: unknown[] = [];

interface OpenEditor {
    save(): Promise<void>;
    backUpWithoutWaitingForIt(): void;
    theFileChangedOnDisk(): Promise<void>;
    editsRecorded: { undo(): void; redo(): void }[];
    documentText(): string;
    undoTheNewestEdit(): Promise<void>;
    redoTheNewestEdit(): Promise<void>;
}

async function openEditor(text: string): Promise<OpenEditor> {
    files.clear();
    files.set(DOCUMENT_PATH, text);
    watchersOnTheFiles.length = 0;
    answersFromTheHost.length = 0;
    monacoEditorsOnThePage.length = 0;

    const provider = new AuthorFileEditorProvider({
        extensionUri: Uri.file("/extension"),
    } as never);
    const editsRecorded: { undo(): void; redo(): void }[] = [];
    provider.onDidChangeCustomDocument((edit) =>
        editsRecorded.push(edit as unknown as { undo(): void; redo(): void }),
    );
    const session = await provider.openCustomDocument(
        Uri.file(DOCUMENT_PATH) as never,
        {} as never,
    );

    let receiveFromThePage: (message: unknown) => void = () => undefined;
    const panel = {
        webview: {
            options: {},
            html: "",
            cspSource: "vscode-resource:",
            asWebviewUri: (uri: unknown) => uri,
            postMessage: (message: unknown) => {
                answersFromTheHost.push(message);
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

    document.body.innerHTML = '<div id="author-file-editor-root"></div>';
    (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
        postMessage: (message: unknown) => receiveFromThePage(message),
    });
    vi.resetModules();
    for (const [type, listener] of listeningForThePage) {
        window.removeEventListener(type, listener);
    }
    listeningForThePage.length = 0;
    const addEventListenerItself = window.addEventListener.bind(window);
    window.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ) => {
        listeningForThePage.push([type, listener]);
        addEventListenerItself(type, listener, options);
    }) as typeof window.addEventListener;
    await act(async () => {
        await import("../../extension/webview/cell_types/MarkdownCell");
        await import("../../extension/webview/message_queue_between_vscode_and_webview");
    });
    window.addEventListener = addEventListenerItself;
    await settle();

    return {
        editsRecorded,
        documentText: () => session.document.text,
        undoTheNewestEdit: async () => {
            await act(async () => {
                editsRecorded[editsRecorded.length - 1]?.undo();
            });
            await settle();
        },
        redoTheNewestEdit: async () => {
            await act(async () => {
                editsRecorded[editsRecorded.length - 1]?.redo();
            });
            await settle();
        },
        backUpWithoutWaitingForIt: () => {
            void provider.backupCustomDocument(session, {
                destination: Uri.file("/backups/-7220695711"),
            } as never);
        },
        save: async () => {
            await provider.saveCustomDocument(session);
            await settle();
        },
        theFileChangedOnDisk: async () => {
            await watchersOnTheFiles[0].theFileChanged();
            await settle();
        },
    };
}

async function answerTheOldestMessage(): Promise<void> {
    const answer = answersFromTheHost.shift();
    await act(async () => {
        window.dispatchEvent(new MessageEvent("message", { data: answer }));
    });
}

async function settle(): Promise<void> {
    for (let pass = 0; pass < 50; pass++) {
        await act(async () => {
            await new Promise((settled) => setTimeout(settled, 0));
        });
        if (answersFromTheHost.length === 0) {
            return;
        }
        await answerTheOldestMessage();
    }
}

async function openTheCellForTyping(): Promise<void> {
    await act(async () => {
        document
            .querySelector(".markdown-rendered")
            ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
}

function theCellBeingTyped() {
    return monacoEditorsOnThePage[monacoEditorsOnThePage.length - 1];
}

async function typeCharacter(character: string): Promise<void> {
    await typeCharacterWithoutWaitingForTheHost(character);
    await settle();
}

async function typeCharacterWithoutWaitingForTheHost(
    character: string,
): Promise<void> {
    await act(async () => {
        theCellBeingTyped().typeCharacter(character);
    });
}

let editor: OpenEditor;

beforeEach(async () => {
    editor = await openEditor("<!-- cell: markdown -->\n\nThe lantern\n");
    await openTheCellForTyping();
});

describe("the cursor while the author types in a cell", () => {
    it("stays where the author is typing when the host answers a keystroke late", async () => {
        await typeCharacterWithoutWaitingForTheHost(" ");
        await typeCharacterWithoutWaitingForTheHost("w");
        await answerTheOldestMessage();
        await typeCharacterWithoutWaitingForTheHost("e");

        await settle();

        expect(theCellBeingTyped().getValue()).toBe("The lantern we");
        expect(theCellBeingTyped().cursorOffset()).toBe(14);
    });

    it("keeps the keystroke the author typed while the editor was being backed up", async () => {
        await typeCharacterWithoutWaitingForTheHost(" ");
        editor.backUpWithoutWaitingForIt();
        await typeCharacterWithoutWaitingForTheHost("w");

        await settle();

        expect(theCellBeingTyped().getValue()).toBe("The lantern w");
        expect(theCellBeingTyped().cursorOffset()).toBe(13);
    });

    it("stays where the author is typing when the file is saved as they type", async () => {
        await typeCharacter(" ");
        await typeCharacter("w");
        await editor.save();
        await typeCharacter("e");

        await editor.theFileChangedOnDisk();

        expect(theCellBeingTyped().cursorOffset()).toBe(14);
        expect(theCellBeingTyped().getValue()).toBe("The lantern we");
    });

    it("stays where the author is typing when they have left a blank line at the end of the cell", async () => {
        await typeCharacter("\n");
        await editor.save();

        await editor.theFileChangedOnDisk();

        expect(theCellBeingTyped().cursorOffset()).toBe(12);
        expect(theCellBeingTyped().getValue()).toBe("The lantern\n");
    });
});

describe("undoing what the author typed", () => {
    it("takes the letter off the page, not only out of the document", async () => {
        await typeCharacter("a");

        await editor.undoTheNewestEdit();

        expect(theCellBeingTyped().getValue()).toBe("The lantern");
        expect(editor.documentText()).toContain("The lantern\n");
    });

    it("takes back the whole run of typing, and puts it back", async () => {
        for (const character of "gers") {
            await typeCharacter(character);
        }
        expect(editor.editsRecorded).toHaveLength(1);

        await editor.undoTheNewestEdit();

        expect(theCellBeingTyped().getValue()).toBe("The lantern");

        await editor.redoTheNewestEdit();

        expect(theCellBeingTyped().getValue()).toBe("The lanterngers");
    });

    it("leaves the page saying what the document says, so the next keystroke follows on", async () => {
        await typeCharacter("a");
        await editor.undoTheNewestEdit();

        await typeCharacter("b");

        expect(theCellBeingTyped().getValue()).toBe("The lanternb");
        expect(editor.documentText()).toContain("The lanternb\n");
    });
});
