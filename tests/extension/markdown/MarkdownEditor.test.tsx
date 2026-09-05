import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const monacoEditors = vi.hoisted(() => {
    return [] as {
        type: (markdown: string) => void;
        getValue: () => string;
        point: (offset: number | null) => void;
        marks: () => {
            range: unknown;
            options: { inlineClassName: string };
        }[];
    }[];
});

vi.mock(
    "monaco-editor/editor/contrib/multicursor/browser/multicursor.js",
    () => ({}),
);
vi.mock("monaco-editor/languages/definitions/markdown/markdown.js", () => ({
    conf: {},
    language: {},
}));
vi.mock("monaco-editor/editor/editor.api", () => {
    const disposable = { dispose: () => {} };
    return {
        KeyMod: { CtrlCmd: 1, Shift: 2 },
        Range: {
            fromPositions: (from: unknown, to: unknown) => ({ from, to }),
        },
        KeyCode: { KeyZ: 4, KeyY: 8, KeyS: 16, Escape: 32 },
        languages: {
            register: () => {},
            setLanguageConfiguration: () => {},
            setMonarchTokensProvider: () => {},
        },
        editor: {
            addKeybindingRules: () => {},
            defineTheme: () => {},
            create: (node: HTMLElement, options: { value: string }) => {
                let value = options.value;
                let changed = (): void => {};
                let pointed: (event: unknown) => void = () => {};
                let marks: {
                    range: unknown;
                    options: { inlineClassName: string };
                }[] = [];
                const editor = {
                    getValue: () => value,
                    setValue: (next: string) => {
                        value = next;
                    },
                    getContentHeight: () => 100,
                    layout: () => {},
                    focus: () => {},
                    dispose: () => {},
                    addCommand: () => {},
                    onDidContentSizeChange: () => disposable,
                    onDidChangeModelContent: (listener: () => void) => {
                        changed = listener;
                        return disposable;
                    },
                    onMouseMove: (listener: (event: unknown) => void) => {
                        pointed = listener;
                        return disposable;
                    },
                    createDecorationsCollection: () => ({
                        set: (
                            next: {
                                range: unknown;
                                options: { inlineClassName: string };
                            }[],
                        ) => {
                            marks = next;
                        },
                    }),
                    getModel: () => ({
                        getOffsetAt: (position: { column: number }) =>
                            position.column - 1,
                        getPositionAt: (offset: number) => ({
                            lineNumber: 1,
                            column: offset + 1,
                        }),
                    }),
                    getScrolledVisiblePosition: () => ({
                        top: 10,
                        left: 20,
                        height: 18,
                    }),
                    marks: () => marks,
                    point: (offset: number | null) =>
                        pointed({
                            target: {
                                position:
                                    offset === null
                                        ? null
                                        : { lineNumber: 1, column: offset + 1 },
                            },
                        }),
                    type: (markdown: string) => {
                        value = markdown;
                        changed();
                    },
                };
                node.dataset.monaco = "open";
                monacoEditors.push(editor);
                return editor;
            },
        },
    };
});

const { MarkdownEditor, MarkdownEditorMediator } =
    await import("../../../extension/webview/markdown/MarkdownEditor");

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SETTLE_AFTER_TYPING_MS = 400;

let root: Root;

function emptyBody(): HTMLElement {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.append(container);
    return container;
}

function committedSpy() {
    return vi.fn();
}

async function mount(
    markdown: string,
    onMarkdownCommitted = committedSpy(),
): Promise<ReturnType<typeof committedSpy>> {
    root = createRoot(emptyBody());
    await render(markdown, onMarkdownCommitted);
    return onMarkdownCommitted;
}

async function render(
    markdown: string,
    onMarkdownCommitted: ReturnType<typeof committedSpy>,
): Promise<void> {
    await act(async () => {
        root.render(
            <MarkdownEditorMediator>
                <MarkdownEditor
                    markdown={markdown}
                    onMarkdownCommitted={onMarkdownCommitted}
                >
                    {(text) => <div className="rendered">{text}</div>}
                </MarkdownEditor>
            </MarkdownEditorMediator>,
        );
    });
}

async function mountAll(
    editors: { markdown: string; committed: ReturnType<typeof committedSpy> }[],
): Promise<void> {
    root = createRoot(emptyBody());
    await act(async () => {
        root.render(
            <MarkdownEditorMediator>
                {editors.map((editor, editorIndex) => (
                    <MarkdownEditor
                        key={editorIndex}
                        markdown={editor.markdown}
                        onMarkdownCommitted={editor.committed}
                    >
                        {(text) => <div className="rendered">{text}</div>}
                    </MarkdownEditor>
                ))}
            </MarkdownEditorMediator>,
        );
    });
}

function rendered(): HTMLElement | null {
    return document.querySelector(".rendered");
}

function renderedMarkdown(): string[] {
    return [...document.querySelectorAll(".rendered")].map(
        (node) => node.textContent ?? "",
    );
}

function openEditor(): HTMLElement | null {
    return document.querySelector("[data-monaco='open']");
}

function openEditorCount(): number {
    return document.querySelectorAll("[data-monaco='open']").length;
}

async function doubleClick(node: Element | null | undefined): Promise<void> {
    await act(async () => {
        node?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
}

async function doubleClickRendered(): Promise<void> {
    await doubleClick(rendered());
}

async function doubleClickRenderedMarkdown(markdown: string): Promise<void> {
    await doubleClick(
        [...document.querySelectorAll(".rendered")].find(
            (node) => node.textContent === markdown,
        ),
    );
}

function latestEditor() {
    return monacoEditors[monacoEditors.length - 1];
}

async function typeIntoEditor(markdown: string): Promise<void> {
    await act(async () => {
        latestEditor().type(markdown);
    });
}

async function pressEscape(): Promise<void> {
    await act(async () => {
        window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
    });
}

async function clickSomethingElse(): Promise<void> {
    await act(async () => {
        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

async function waitForTypingToSettle(): Promise<void> {
    await act(async () => {
        await new Promise((settled) =>
            setTimeout(settled, SETTLE_AFTER_TYPING_MS + 50),
        );
    });
}

beforeEach(() => {
    monacoEditors.length = 0;
});

describe("markdown that is not being edited", () => {
    it("hands the child the markdown to render", async () => {
        await mount("The lantern.");

        expect(rendered()?.textContent).toBe("The lantern.");
        expect(openEditor()).toBeNull();
    });

    it("renders the markdown itself when there is no child", async () => {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator>
                    <MarkdownEditor
                        markdown="# The lantern"
                        onMarkdownCommitted={committedSpy()}
                    />
                </MarkdownEditorMediator>,
            );
        });

        expect(
            document.querySelector(".markdown-rendered h1")?.textContent,
        ).toBe("The lantern");
    });
});

describe("opening the editor", () => {
    it("replaces the rendered markdown with an editor on a double click", async () => {
        await mount("The lantern.");

        await doubleClickRendered();

        expect(rendered()).toBeNull();
        expect(openEditor()).not.toBeNull();
    });

    it("opens the editor on the markdown it was given", async () => {
        await mount("The lantern.");

        await doubleClickRendered();

        expect(monacoEditors[0].getValue()).toBe("The lantern.");
    });
});

describe("editing", () => {
    it("commits a pause in the typing and stays open", async () => {
        const committed = await mount("The lantern.");
        await doubleClickRendered();

        await typeIntoEditor("The lantern had gone out.");
        await waitForTypingToSettle();

        expect(committed).toHaveBeenCalledWith("The lantern had gone out.");
        expect(openEditor()).not.toBeNull();
    });

    it("stays open when something else is clicked once", async () => {
        await mount("The lantern.");
        await doubleClickRendered();

        await clickSomethingElse();

        expect(openEditor()).not.toBeNull();
    });
});

describe("closing the editor", () => {
    it("commits the draft and renders it when escape is pressed", async () => {
        const committed = await mount("The lantern.");
        await doubleClickRendered();

        await typeIntoEditor("The lantern had gone out.");
        await pressEscape();

        expect(committed).toHaveBeenCalledWith("The lantern had gone out.");
        expect(openEditor()).toBeNull();
    });

    it("closes on escape after the editor has lost focus", async () => {
        const committed = await mount("The lantern.");
        await doubleClickRendered();
        await typeIntoEditor("The lantern had gone out.");

        await clickSomethingElse();
        await pressEscape();

        expect(openEditor()).toBeNull();
        expect(committed).toHaveBeenCalledWith("The lantern had gone out.");
    });
});

describe("markdown that changes underneath the editor", () => {
    it("follows the new markdown while the editor is open", async () => {
        const committed = committedSpy();
        await mount("The lantern.", committed);
        await doubleClickRendered();

        await render("The lantern had gone out.", committed);

        expect(monacoEditors[0].getValue()).toBe("The lantern had gone out.");
    });
});

describe("two editors", () => {
    it("opens the one that was double clicked", async () => {
        await mountAll([
            { markdown: "The lantern.", committed: committedSpy() },
            { markdown: "The night.", committed: committedSpy() },
        ]);

        await doubleClickRenderedMarkdown("The night.");

        expect(openEditorCount()).toBe(1);
        expect(renderedMarkdown()).toEqual(["The lantern."]);
    });

    it("closes the first when the second is opened", async () => {
        await mountAll([
            { markdown: "The lantern.", committed: committedSpy() },
            { markdown: "The night.", committed: committedSpy() },
        ]);

        await doubleClickRenderedMarkdown("The lantern.");
        await doubleClickRenderedMarkdown("The night.");

        expect(openEditorCount()).toBe(1);
        expect(renderedMarkdown()).toEqual(["The lantern."]);
    });

    it("commits nothing on the way out, since the page may have moved on", async () => {
        const lantern = committedSpy();
        await mountAll([
            { markdown: "The lantern.", committed: lantern },
            { markdown: "The night.", committed: committedSpy() },
        ]);

        await doubleClickRenderedMarkdown("The lantern.");
        await typeIntoEditor("The lantern had gone out.");
        await doubleClickRenderedMarkdown("The night.");

        expect(lantern).not.toHaveBeenCalled();
    });
});

describe("what the checks found in the prose being written", () => {
    const REPEATED = {
        id: 3,
        kind: "style",
        at: 10,
        end: 19,
        message: "Repeated word",
        detail: "“very very” says it twice.",
        replacements: ["very"],
    };

    async function openEditorWithMarks(
        onFixAsked = vi.fn(),
    ): Promise<ReturnType<typeof vi.fn>> {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator>
                    <MarkdownEditor
                        markdown="It was very very late."
                        errors={[REPEATED]}
                        onFixAsked={onFixAsked}
                        onMarkdownCommitted={committedSpy()}
                    >
                        {(text) => <div className="rendered">{text}</div>}
                    </MarkdownEditor>
                </MarkdownEditorMediator>,
            );
        });
        await doubleClickRendered();
        return onFixAsked;
    }

    async function pointAt(offset: number | null): Promise<void> {
        await act(async () => {
            latestEditor().point(offset);
        });
    }

    function tooltip(): HTMLElement | null {
        return document.querySelector(".linter-tooltip");
    }

    it("underlines the words it was found in", async () => {
        await openEditorWithMarks();

        expect(latestEditor().marks()).toEqual([
            {
                range: {
                    from: { lineNumber: 1, column: 11 },
                    to: { lineNumber: 1, column: 20 },
                },
                options: {
                    inlineClassName:
                        "markdown-editor-mark markdown-editor-mark-style",
                },
            },
        ]);
    });

    it("says what it found when the pointer stops on the underline", async () => {
        await openEditorWithMarks();

        await pointAt(12);

        expect(tooltip()?.textContent).toContain("Repeated word");
    });

    it("says nothing when the pointer is on prose it had no quarrel with", async () => {
        await openEditorWithMarks();

        await pointAt(2);
        await act(async () => {
            await new Promise((over) => setTimeout(over, 250));
        });

        expect(tooltip()).toBeNull();
    });

    it("offers nothing to press when the check had no answer to give", async () => {
        root = createRoot(emptyBody());
        await act(async () => {
            root.render(
                <MarkdownEditorMediator>
                    <MarkdownEditor
                        markdown="It was very very late."
                        errors={[{ ...REPEATED, replacements: [] }]}
                        onFixAsked={vi.fn()}
                        onMarkdownCommitted={committedSpy()}
                    >
                        {(text) => <div className="rendered">{text}</div>}
                    </MarkdownEditor>
                </MarkdownEditorMediator>,
            );
        });
        await doubleClickRendered();

        await pointAt(12);

        expect(tooltip()?.textContent).toContain("Repeated word");
        expect(document.querySelector(".linter-tooltip-fix")).toBeNull();
    });

    it("asks for the fault under the pointer to be put right", async () => {
        const onFixAsked = await openEditorWithMarks();
        await pointAt(12);

        await act(async () => {
            document
                .querySelector(".linter-tooltip-fix")!
                .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onFixAsked).toHaveBeenCalledWith(REPEATED);
    });
});
