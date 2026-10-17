import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { AuthorFileEditorProvider } from "../../../extension/vscode_runtime/author_file_editor_provider";
import { PublishView } from "../../../extension/vscode_runtime/publish/panel";
import { Uri, files, watchersOnTheFiles, window as vscodeWindow } from "../vscode";

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

import { monacoEditorsOnThePage } from "../markdown/monaco_editor_double";

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
    selectTheSalientConcept(conceptCellId: string): Promise<void>;
}

async function openEditor(text: string): Promise<OpenEditor> {
    files.clear();
    files.set(DOCUMENT_PATH, text);
    watchersOnTheFiles.length = 0;
    answersFromTheHost.length = 0;
    monacoEditorsOnThePage.length = 0;

    const provider = new AuthorFileEditorProvider(
        { extensionUri: Uri.file("/extension") } as never,
        vscodeWindow.createOutputChannel("Authorship") as never,
        new PublishView({ extensionUri: Uri.file("/extension") } as never),
    );
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
        onDidChangeViewState: () => ({ dispose: () => undefined }),
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
        await import("../../../extension/webview/cell_types/MarkdownCell");
        await import("../../../extension/webview/message_queue_between_vscode_and_webview");
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
        selectTheSalientConcept: async (conceptCellId: string) => {
            await act(async () => {
                session.selectTheSalientConcept(conceptCellId);
            });
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

    it("puts the cursor back where it stood before a space typed beside another was taken back", async () => {
        theCellBeingTyped().putTheCursorAt(3);
        await typeCharacter(" ");

        await editor.undoTheNewestEdit();

        expect(theCellBeingTyped().getValue()).toBe("The lantern");
        expect(theCellBeingTyped().cursorOffset()).toBe(3);
    });

    it("puts the cursor after a space typed beside another when it is put back", async () => {
        theCellBeingTyped().putTheCursorAt(3);
        await typeCharacter(" ");
        await editor.undoTheNewestEdit();

        await editor.redoTheNewestEdit();

        expect(theCellBeingTyped().getValue()).toBe("The  lantern");
        expect(theCellBeingTyped().cursorOffset()).toBe(4);
    });

    it("leaves the page saying what the document says, so the next keystroke follows on", async () => {
        await typeCharacter("a");
        await editor.undoTheNewestEdit();

        await typeCharacter("b");

        expect(theCellBeingTyped().getValue()).toBe("The lanternb");
        expect(editor.documentText()).toContain("The lanternb\n");
    });
});

describe("finding in what the author has just typed", () => {
    it("marks the match where it stands in the text as typed", async () => {
        theCellBeingTyped().putTheCursorAt(0);
        await typeCharacter("A");
        await typeCharacter(" ");
        await act(async () => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
            );
        });
        const lookedForBox = document.querySelector<HTMLInputElement>(
            'input[aria-label="Find"]',
        )!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )!.set!.call(lookedForBox, "lantern");
            lookedForBox.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await settle();

        expect(theCellBeingTyped().marks()).toEqual([
            {
                range: {
                    from: { lineNumber: 1, column: 7 },
                    to: { lineNumber: 1, column: 14 },
                },
                options: {
                    inlineClassName:
                        "author-file-editor-find-match author-file-editor-find-match-current",
                },
            },
        ]);
    });

    it("moves the mark along with the words when the author types before them", async () => {
        await act(async () => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
            );
        });
        const lookedForBox = document.querySelector<HTMLInputElement>(
            'input[aria-label="Find"]',
        )!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )!.set!.call(lookedForBox, "lantern");
            lookedForBox.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await settle();

        theCellBeingTyped().putTheCursorAt(0);
        await typeCharacter("A");
        await typeCharacter(" ");

        expect(theCellBeingTyped().marks()).toEqual([
            {
                range: {
                    from: { lineNumber: 1, column: 7 },
                    to: { lineNumber: 1, column: 14 },
                },
                options: {
                    inlineClassName:
                        "author-file-editor-find-match author-file-editor-find-match-current",
                },
            },
        ]);
    });
});

describe("the words of a salient concept while the author types", () => {
    it.each([
        {
            edit: "an em dash before them spaced apart",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightBefore: {
                from: { lineNumber: 1, column: 22 },
                to: { lineNumber: 1, column: 49 },
            },
            keystrokes: [
                { cursorAt: 18, typed: " " },
                { cursorAt: 20, typed: " " },
            ],
            textAfter: "She waited for him — a Companion knelt—head bowed.",
            highlightAfter: {
                from: { lineNumber: 1, column: 24 },
                to: { lineNumber: 1, column: 51 },
            },
        },
        {
            edit: "a word typed before them",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightBefore: {
                from: { lineNumber: 1, column: 22 },
                to: { lineNumber: 1, column: 49 },
            },
            keystrokes: [
                { cursorAt: 11, typed: "long " },
            ],
            textAfter: "She waited long for him—a Companion knelt—head bowed.",
            highlightAfter: {
                from: { lineNumber: 1, column: 27 },
                to: { lineNumber: 1, column: 54 },
            },
        },
        {
            edit: "an em dash among them spaced apart",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightBefore: {
                from: { lineNumber: 1, column: 22 },
                to: { lineNumber: 1, column: 49 },
            },
            keystrokes: [
                { cursorAt: 36, typed: " " },
                { cursorAt: 38, typed: " " },
            ],
            textAfter: "She waited for him—a Companion knelt — head bowed.",
            highlightAfter: {
                from: { lineNumber: 1, column: 22 },
                to: { lineNumber: 1, column: 51 },
            },
        },
        {
            edit: "a word typed among them",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightBefore: {
                from: { lineNumber: 1, column: 22 },
                to: { lineNumber: 1, column: 49 },
            },
            keystrokes: [
                { cursorAt: 31, typed: "slowly " },
            ],
            textAfter: "She waited for him—a Companion slowly knelt—head bowed.",
            highlightAfter: {
                from: { lineNumber: 1, column: 22 },
                to: { lineNumber: 1, column: 56 },
            },
        },
        {
            edit: "a sentence typed after them",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightBefore: {
                from: { lineNumber: 1, column: 22 },
                to: { lineNumber: 1, column: 49 },
            },
            keystrokes: [
                { cursorAt: 48, typed: " Then she smiled." },
            ],
            textAfter:
                "She waited for him—a Companion knelt—head bowed. Then she smiled.",
            highlightAfter: {
                from: { lineNumber: 1, column: 22 },
                to: { lineNumber: 1, column: 49 },
            },
        },
    ])(
        "move with the concept's words after $edit",
        async ({
            textBefore,
            highlightBefore,
            keystrokes,
            textAfter,
            highlightAfter,
        }) => {
            editor = await openEditor(
                [
                    '<!-- cell: markdown id="m1" -->',
                    "",
                    textBefore,
                    "",
                    '<!-- cell: salient-concept id="k1" title="The Companion" words="4-6" -->',
                    "",
                    "The man who kneels.",
                    "",
                ].join("\n"),
            );
            await editor.selectTheSalientConcept("k1");
            await openTheCellForTyping();

            expect(theCellBeingTyped().marks()).toEqual([
                {
                    range: highlightBefore,
                    options: {
                        inlineClassName:
                            "markdown-editor-salient-concept markdown-editor-salient-concept-0",
                    },
                },
            ]);

            for (const { cursorAt, typed } of keystrokes) {
                theCellBeingTyped().putTheCursorAt(cursorAt);
                await typeCharacter(typed);
            }

            expect(theCellBeingTyped().getValue()).toBe(textAfter);
            expect(theCellBeingTyped().marks()).toEqual([
                {
                    range: highlightAfter,
                    options: {
                        inlineClassName:
                            "markdown-editor-salient-concept markdown-editor-salient-concept-0",
                    },
                },
            ]);
        },
    );
});

describe("the words found while the author types", () => {
    it.each([
        {
            edit: "an em dash before them spaced apart",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightsBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName:
                            "author-file-editor-find-match author-file-editor-find-match-current",
                    },
                },
            ],
            keystrokes: [
                { cursorAt: 18, typed: " " },
                { cursorAt: 20, typed: " " },
            ],
            textAfter: "She waited for him — a Companion knelt—head bowed.",
            highlightsAfter: [
                {
                    range: {
                        from: { lineNumber: 1, column: 24 },
                        to: { lineNumber: 1, column: 50 },
                    },
                    options: {
                        inlineClassName:
                            "author-file-editor-find-match author-file-editor-find-match-current",
                    },
                },
            ],
        },
        {
            edit: "a word typed before them",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightsBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName:
                            "author-file-editor-find-match author-file-editor-find-match-current",
                    },
                },
            ],
            keystrokes: [{ cursorAt: 11, typed: "long " }],
            textAfter: "She waited long for him—a Companion knelt—head bowed.",
            highlightsAfter: [
                {
                    range: {
                        from: { lineNumber: 1, column: 27 },
                        to: { lineNumber: 1, column: 53 },
                    },
                    options: {
                        inlineClassName:
                            "author-file-editor-find-match author-file-editor-find-match-current",
                    },
                },
            ],
        },
        {
            edit: "an em dash among them spaced apart",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightsBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName:
                            "author-file-editor-find-match author-file-editor-find-match-current",
                    },
                },
            ],
            keystrokes: [
                { cursorAt: 36, typed: " " },
                { cursorAt: 38, typed: " " },
            ],
            textAfter: "She waited for him—a Companion knelt — head bowed.",
            highlightsAfter: [],
        },
        {
            edit: "a word typed among them",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightsBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName:
                            "author-file-editor-find-match author-file-editor-find-match-current",
                    },
                },
            ],
            keystrokes: [{ cursorAt: 31, typed: "slowly " }],
            textAfter:
                "She waited for him—a Companion slowly knelt—head bowed.",
            highlightsAfter: [],
        },
        {
            edit: "a sentence typed after them",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            highlightsBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName:
                            "author-file-editor-find-match author-file-editor-find-match-current",
                    },
                },
            ],
            keystrokes: [{ cursorAt: 48, typed: " Then she smiled." }],
            textAfter:
                "She waited for him—a Companion knelt—head bowed. Then she smiled.",
            highlightsAfter: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName:
                            "author-file-editor-find-match author-file-editor-find-match-current",
                    },
                },
            ],
        },
    ])(
        "move with the found words after $edit",
        async ({
            textBefore,
            highlightsBefore,
            keystrokes,
            textAfter,
            highlightsAfter,
        }) => {
            editor = await openEditor(
                ['<!-- cell: markdown id="m1" -->', "", textBefore, ""].join(
                    "\n",
                ),
            );
            await openTheCellForTyping();
            await act(async () => {
                document.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "f", ctrlKey: true }),
                );
            });
            const lookedForBox = document.querySelector<HTMLInputElement>(
                'input[aria-label="Find"]',
            )!;
            await act(async () => {
                Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    "value",
                )!.set!.call(lookedForBox, "Companion knelt—head bowed");
                lookedForBox.dispatchEvent(
                    new Event("input", { bubbles: true }),
                );
            });
            await settle();

            expect(theCellBeingTyped().marks()).toEqual(highlightsBefore);

            for (const { cursorAt, typed } of keystrokes) {
                theCellBeingTyped().putTheCursorAt(cursorAt);
                await typeCharacter(typed);
            }

            expect(theCellBeingTyped().getValue()).toBe(textAfter);
            expect(theCellBeingTyped().marks()).toEqual(highlightsAfter);
        },
    );
});

describe("the prose errors marked while the author types", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it.each([
        {
            edit: "an em dash before them spaced apart",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            marksBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName: "markdown-editor-mark markdown-editor-mark-style",
                    },
                },
            ],
            keystrokes: [
                { cursorAt: 18, typed: " " },
                { cursorAt: 20, typed: " " },
            ],
            textAfter: "She waited for him — a Companion knelt—head bowed.",
            marksAfter: [
                {
                    range: {
                        from: { lineNumber: 1, column: 24 },
                        to: { lineNumber: 1, column: 50 },
                    },
                    options: {
                        inlineClassName: "markdown-editor-mark markdown-editor-mark-style",
                    },
                },
            ],
        },
        {
            edit: "a word typed before them",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            marksBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName: "markdown-editor-mark markdown-editor-mark-style",
                    },
                },
            ],
            keystrokes: [{ cursorAt: 11, typed: "long " }],
            textAfter: "She waited long for him—a Companion knelt—head bowed.",
            marksAfter: [
                {
                    range: {
                        from: { lineNumber: 1, column: 27 },
                        to: { lineNumber: 1, column: 53 },
                    },
                    options: {
                        inlineClassName: "markdown-editor-mark markdown-editor-mark-style",
                    },
                },
            ],
        },
        {
            edit: "an em dash among them spaced apart",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            marksBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName: "markdown-editor-mark markdown-editor-mark-style",
                    },
                },
            ],
            keystrokes: [
                { cursorAt: 36, typed: " " },
                { cursorAt: 38, typed: " " },
            ],
            textAfter: "She waited for him—a Companion knelt — head bowed.",
            marksAfter: [],
        },
        {
            edit: "a word typed among them",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            marksBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName: "markdown-editor-mark markdown-editor-mark-style",
                    },
                },
            ],
            keystrokes: [{ cursorAt: 31, typed: "slowly " }],
            textAfter: "She waited for him—a Companion slowly knelt—head bowed.",
            marksAfter: [],
        },
        {
            edit: "a sentence typed after them",
            textBefore: "She waited for him—a Companion knelt—head bowed.",
            marksBefore: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName: "markdown-editor-mark markdown-editor-mark-style",
                    },
                },
            ],
            keystrokes: [{ cursorAt: 48, typed: " Then she smiled." }],
            textAfter:
                "She waited for him—a Companion knelt—head bowed. Then she smiled.",
            marksAfter: [
                {
                    range: {
                        from: { lineNumber: 1, column: 22 },
                        to: { lineNumber: 1, column: 48 },
                    },
                    options: {
                        inlineClassName: "markdown-editor-mark markdown-editor-mark-style",
                    },
                },
            ],
        },
    ])(
        "move with the marked words after $edit",
        async ({
            textBefore,
            marksBefore,
            keystrokes,
            textAfter,
            marksAfter,
        }) => {
            vi.stubGlobal("fetch", (url: string) =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve(
                            url.includes("/check/errors/status")
                                ? {
                                      running: false,
                                      error: null,
                                      findings: [
                                          {
                                              cellId: "m1",
                                              startCharacterOffsetInCell: 21,
                                              endCharacterOffsetInCell: 47,
                                              wordsInTheCell:
                                                  "Companion knelt—head bowed",
                                              isVisible: true,
                                              ruleThatFoundTheError:
                                                  "filter-word",
                                              isAnErrorOf: "style",
                                              reasonForError:
                                                  "It reports rather than shows.",
                                              correctVersion: "",
                                          },
                                      ],
                                  }
                                : { id: "job-1" },
                        ),
                }),
            );
            editor = await openEditor(
                ['<!-- cell: markdown id="m1" -->', "", textBefore, ""].join(
                    "\n",
                ),
            );
            vi.useFakeTimers();
            await act(async () => {
                document
                    .querySelector<HTMLButtonElement>(
                        'button[aria-label="Check Prose — read the whole session.document for faults of usage and style"]',
                    )!
                    .click();
            });
            await vi.runAllTimersAsync();
            vi.useRealTimers();
            await settle();
            await openTheCellForTyping();

            expect(theCellBeingTyped().marks()).toEqual(marksBefore);

            for (const { cursorAt, typed } of keystrokes) {
                theCellBeingTyped().putTheCursorAt(cursorAt);
                await typeCharacter(typed);
            }

            expect(theCellBeingTyped().getValue()).toBe(textAfter);
            expect(theCellBeingTyped().marks()).toEqual(marksAfter);
        },
    );
});
