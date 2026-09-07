import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellRun,
    AuthorFileEditorCellState,
    AuthorFileEditorCellWarning,
} from "../../../extension/webview/author_editor/AuthorFileEditorCell";
import type { ProseCheckError } from "../../../extension/vscode_runtime/commands/check_prose";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(cell: ReactNode): Promise<void> {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
        createRoot(container).render(cell);
    });
}

function sidebar(): Element {
    return document.querySelector(".author-file-editor-cell-sidebar")!;
}

async function hover(element: Element, event: string): Promise<void> {
    await act(async () => {
        element.dispatchEvent(new MouseEvent(event, { bubbles: true }));
    });
}

describe("the sidebar every cell has", () => {
    it("is there even when the cell puts nothing in it", async () => {
        await mount(
            <AuthorFileEditorCell>
                <AuthorFileEditorCellHeader>
                    Markdown
                </AuthorFileEditorCellHeader>
            </AuthorFileEditorCell>,
        );
        expect(sidebar()).not.toBeNull();
        expect(sidebar().children).toHaveLength(0);
    });

    it("holds what the cell renders into it", async () => {
        await mount(
            <AuthorFileEditorCell
                sidebar={
                    <AuthorFileEditorCellRun
                        isRunning={false}
                        onRun={() => undefined}
                    />
                }
            >
                <AuthorFileEditorCellHeader>
                    Contents
                </AuthorFileEditorCellHeader>
            </AuthorFileEditorCell>,
        );
        expect(
            sidebar().querySelector(".author-file-editor-cell-run"),
        ).not.toBeNull();
    });

    it("leaves the cell's own parts out of it", async () => {
        await mount(
            <AuthorFileEditorCell>
                <AuthorFileEditorCellHeader>
                    Markdown
                </AuthorFileEditorCellHeader>
            </AuthorFileEditorCell>,
        );
        expect(
            sidebar().querySelector(".author-file-editor-cell-header"),
        ).toBeNull();
        expect(
            document.querySelector(
                ".author-file-editor-cell-main .author-file-editor-cell-header",
            ),
        ).not.toBeNull();
    });
});

describe("what the prose checker found", () => {
    const posted: unknown[] = [];

    function errorSaying(
        reasonForError: string,
        correctVersion = "",
    ): ProseCheckError {
        return {
            cellId: "c1",
            startCharacterOffsetInCell: 10,
            endCharacterOffsetInCell: 19,
            wordsInTheCell: "very very",
            isVisible: true,
            ruleThatFoundTheError: "echo",
            isAnErrorOf: "style",
            reasonForError,
            correctVersion,
        };
    }

    async function mountWarning(proseErrors: ProseCheckError[]): Promise<void> {
        posted.length = 0;
        await mount(
            <AuthorFileEditorCellState
                cellCommands={[]}
                cellIndex={0}
                cellAttributes={{}}
                proseErrors={proseErrors}
                postToHost={(message) => posted.push(message)}
            >
                <AuthorFileEditorCellWarning />
            </AuthorFileEditorCellState>,
        );
    }

    function warning(): Element {
        return document.querySelector(".author-file-editor-cell-warning")!;
    }

    it("says nothing when it found nothing", async () => {
        await mountWarning([]);
        expect(
            document.querySelector(".author-file-editor-cell-warning"),
        ).toBeNull();
    });

    it("marks the cell when it found something", async () => {
        await mountWarning([errorSaying("Repeated word")]);
        expect(warning().querySelector("i")?.className).toBe(
            "codicon codicon-warning",
        );
    });

    it("says no more than that, since a mark is what carries the words", async () => {
        await mountWarning([errorSaying("Repeated word", "very")]);

        await hover(warning(), "mouseover");

        expect(document.querySelector(".linter-tooltip")).toBeNull();
    });
});

describe("running a cell that writes itself", () => {
    it("offers to run it", async () => {
        const run = vi.fn();
        await mount(<AuthorFileEditorCellRun isRunning={false} onRun={run} />);
        const button = document.querySelector(".author-file-editor-cell-run")!;
        expect(button.querySelector("i")?.className).toBe(
            "codicon codicon-play",
        );

        await act(async () => {
            button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(run).toHaveBeenCalledTimes(1);
    });

    it("turns while it runs, and cannot be asked twice", async () => {
        const run = vi.fn();
        await mount(<AuthorFileEditorCellRun isRunning={true} onRun={run} />);
        const button = document.querySelector(
            ".author-file-editor-cell-run",
        ) as HTMLButtonElement;

        expect(button.querySelector("i")?.className).toBe(
            "codicon codicon-loading codicon-modifier-spin",
        );
        expect(button.disabled).toBe(true);
    });
});
