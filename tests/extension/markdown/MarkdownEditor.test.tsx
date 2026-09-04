import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const monacoEditors = vi.hoisted(() => {
    return [] as {
        type: (markdown: string) => void;
        blur: () => void;
        getValue: () => string;
    }[];
});

vi.mock("monaco-editor/editor/contrib/multicursor/browser/multicursor.js", () => ({}));
vi.mock("monaco-editor/languages/definitions/markdown/markdown.js", () => ({
    conf: {},
    language: {},
}));
vi.mock("monaco-editor/editor/editor.api", () => {
    const disposable = { dispose: () => {} };
    return {
        KeyMod: { CtrlCmd: 1, Shift: 2 },
        KeyCode: { KeyZ: 4, KeyY: 8, KeyS: 16, Escape: 32 },
        languages: {
            register: () => {},
            setLanguageConfiguration: () => {},
            setMonarchTokensProvider: () => {},
        },
        editor: {
            addKeybindingRules: () => {},
            create: (node: HTMLElement, options: { value: string }) => {
                let value = options.value;
                let changed = (): void => {};
                let blurred = (): void => {};
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
                    onDidBlurEditorWidget: (listener: () => void) => {
                        blurred = listener;
                        return disposable;
                    },
                    type: (markdown: string) => {
                        value = markdown;
                        changed();
                    },
                    blur: () => blurred(),
                };
                node.dataset.monaco = "open";
                monacoEditors.push(editor);
                return editor;
            },
        },
    };
});

const { MarkdownEditor } = await import(
    "../../../extension/markdown/MarkdownEditor"
);
const { Cell } = await import("../../../extension/storydoc/model");

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SETTLE_AFTER_TYPING_MS = 400;

let root: Root;

interface MountOptions {
    cell: InstanceType<typeof Cell>;
    markdownFromSource?: (source: string) => string;
    sourceFromMarkdown?: (markdown: string) => string;
}

async function mount(options: MountOptions): Promise<void> {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await render(options);
}

async function render(options: MountOptions): Promise<void> {
    await act(async () => {
        root.render(
            <MarkdownEditor
                cell={options.cell}
                markdownFromSource={options.markdownFromSource}
                sourceFromMarkdown={options.sourceFromMarkdown}
            >
                {(markdown) => <div className="rendered">{markdown}</div>}
            </MarkdownEditor>,
        );
    });
}

function rendered(): HTMLElement | null {
    return document.querySelector(".rendered");
}

function openEditor(): HTMLElement | null {
    return document.querySelector("[data-monaco='open']");
}

async function doubleClickRendered(): Promise<void> {
    await act(async () => {
        rendered()?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
}

async function typeIntoEditor(markdown: string): Promise<void> {
    await act(async () => {
        monacoEditors[monacoEditors.length - 1].type(markdown);
    });
}

async function blurEditor(): Promise<void> {
    await act(async () => {
        monacoEditors[monacoEditors.length - 1].blur();
    });
}

beforeEach(() => {
    monacoEditors.length = 0;
});

describe("a cell that is not being edited", () => {
    it("hands the child the cell's markdown to render", async () => {
        await mount({ cell: new Cell("markdown", "The lantern.", {}) });

        expect(rendered()?.textContent).toBe("The lantern.");
        expect(openEditor()).toBeNull();
    });

    it("hands the child the markdown taken out of the source", async () => {
        await mount({
            cell: new Cell("note", "<!--\nRemember the lantern.\n-->", {}),
            markdownFromSource: (source) =>
                source.slice("<!--\n".length, -"\n-->".length),
        });

        expect(rendered()?.textContent).toBe("Remember the lantern.");
    });
});

describe("opening the editor", () => {
    it("replaces the rendered markdown with an editor on a double click", async () => {
        await mount({ cell: new Cell("markdown", "The lantern.", {}) });

        await doubleClickRendered();

        expect(rendered()).toBeNull();
        expect(openEditor()).not.toBeNull();
    });

    it("opens the editor on the markdown taken out of the source", async () => {
        await mount({
            cell: new Cell("note", "<!--\nRemember.\n-->", {}),
            markdownFromSource: (source) =>
                source.slice("<!--\n".length, -"\n-->".length),
        });

        await doubleClickRendered();

        expect(monacoEditors[0].getValue()).toBe("Remember.");
    });
});

describe("editing", () => {
    it("writes a pause in the typing back to the cell and stays open", async () => {
        const cell = new Cell("markdown", "The lantern.", {});
        await mount({ cell });
        await doubleClickRendered();

        await typeIntoEditor("The lantern had gone out.");
        await act(async () => {
            await new Promise((settled) =>
                setTimeout(settled, SETTLE_AFTER_TYPING_MS + 50),
            );
        });

        expect(cell.source).toBe("The lantern had gone out.");
        expect(openEditor()).not.toBeNull();
    });

    it("puts the markdown back into the source it came out of", async () => {
        const cell = new Cell("note", "<!--\nRemember.\n-->", {});
        await mount({
            cell,
            markdownFromSource: (source) =>
                source.slice("<!--\n".length, -"\n-->".length),
            sourceFromMarkdown: (markdown) => `<!--\n${markdown}\n-->`,
        });
        await doubleClickRendered();

        await typeIntoEditor("Remember the lantern.");
        await blurEditor();

        expect(cell.source).toBe("<!--\nRemember the lantern.\n-->");
    });
});

describe("closing the editor", () => {
    it("commits the draft and renders it when the editor loses focus", async () => {
        const cell = new Cell("markdown", "The lantern.", {});
        await mount({ cell });
        await doubleClickRendered();

        await typeIntoEditor("The lantern had gone out.");
        await blurEditor();

        expect(cell.source).toBe("The lantern had gone out.");
        expect(openEditor()).toBeNull();
        expect(rendered()?.textContent).toBe("The lantern had gone out.");
    });
});

describe("a cell that changes underneath the editor", () => {
    it("follows the new source while the editor is open", async () => {
        const cell = new Cell("markdown", "The lantern.", {});
        await mount({ cell });
        await doubleClickRendered();

        cell.source = "The lantern had gone out.";
        await render({ cell });

        expect(monacoEditors[0].getValue()).toBe("The lantern had gone out.");
    });
});
