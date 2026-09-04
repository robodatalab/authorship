import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { AuthorFileEditorCanvas } from "../../../extension/webview/author_editor/AuthorFileEditorCanvas";
import { AuthorFileEditorCell } from "../../../extension/webview/author_editor/AuthorFileEditorCell";
import type { WebviewAuthorDocumentCommandCard } from "../../../extension/vscode_runtime/commands/author_document_command";
import type {
    AuthorDocumentCellRenderers,
    WebviewCell,
} from "../../../extension/webview/author_editor/AuthorFileEditorCanvas";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function markdownCell(source: string): WebviewCell {
    return { kind: "markdown", source, attrs: {} };
}

const CELL_RENDERERS: AuthorDocumentCellRenderers = {
    markdown: (cell) => <div className="test-cell">{cell.source}</div>,
};

function command(
    tooltip: string,
    category: string,
): WebviewAuthorDocumentCommandCard & { invoke: ReturnType<typeof vi.fn> } {
    return {
        name: tooltip,
        category,
        iconClassName: `codicon codicon-${tooltip.toLowerCase()}`,
        tooltip,
        invoke: vi.fn(),
    };
}

const insertPositionsAsked: number[] = [];
const cellPositionsAsked: number[] = [];

async function mountCanvas(options: {
    cells?: WebviewCell[];
    mainMenuCommands?: WebviewAuthorDocumentCommandCard[];
    cellInsertCommands?: WebviewAuthorDocumentCommandCard[];
    cellCommands?: WebviewAuthorDocumentCommandCard[];
    cellRenderers?: AuthorDocumentCellRenderers;
}): Promise<void> {
    insertPositionsAsked.length = 0;
    cellPositionsAsked.length = 0;
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
        createRoot(container).render(
            <AuthorFileEditorCanvas
                cells={options.cells ?? []}
                postToHost={() => undefined}
                cellRenderers={options.cellRenderers ?? CELL_RENDERERS}
                mainMenuCommands={options.mainMenuCommands ?? []}
                cellInsertCommandsAt={(at) => {
                    insertPositionsAsked.push(at);
                    return options.cellInsertCommands ?? [];
                }}
                cellCommandsAt={(at) => {
                    cellPositionsAsked.push(at);
                    return options.cellCommands ?? [];
                }}
            />,
        );
    });
}

function insertMenus(): Element[] {
    return [
        ...document.querySelectorAll(".author-file-editor-insert-cell-menu"),
    ];
}

function listItems(): Element[] {
    return [
        ...document.querySelectorAll(".author-file-editor-canvas > ul > li"),
    ];
}

async function click(element: Element): Promise<void> {
    await act(async () => {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

describe("where the insert menus go", () => {
    it("puts one above the first cell when the document is empty", async () => {
        await mountCanvas({ cells: [] });
        expect(insertMenus()).toHaveLength(1);
    });

    it("puts one above the first cell and one below every cell", async () => {
        await mountCanvas({
            cells: [markdownCell("one"), markdownCell("two")],
        });
        expect(insertMenus()).toHaveLength(3);
    });

    it("draws the first menu before any cell", async () => {
        await mountCanvas({ cells: [markdownCell("one")] });
        const first = listItems()[0];
        expect(
            first.querySelector(".author-file-editor-insert-cell-menu"),
        ).not.toBeNull();
        expect(first.querySelector(".test-cell")).toBeNull();
    });

    it("draws every other menu after the cell it belongs to", async () => {
        await mountCanvas({
            cells: [markdownCell("one"), markdownCell("two")],
        });
        for (const item of listItems().slice(1)) {
            const children = [...item.children];
            expect(children[0].className).toBe("test-cell");
            expect(children[1].className).toBe(
                "author-file-editor-insert-cell-menu",
            );
        }
    });

    it("gives a cell it cannot render no menu of its own", async () => {
        await mountCanvas({
            cells: [
                markdownCell("kept"),
                { kind: "chapter", source: "", attrs: {} },
            ],
        });
        expect(insertMenus()).toHaveLength(2);
    });
});

describe("invoking a cell insert command", () => {
    it("calls the command the button was drawn from", async () => {
        const addMarkdown = command("Markdown", "primary");
        const addChapter = command("Chapter", "primary");
        await mountCanvas({
            cells: [markdownCell("one")],
            cellInsertCommands: [addMarkdown, addChapter],
        });

        const buttons = insertMenus()[0].querySelectorAll("button");
        await click(buttons[1]);

        expect(addChapter.invoke).toHaveBeenCalledTimes(1);
        expect(addMarkdown.invoke).not.toHaveBeenCalled();
    });

    it("keeps each menu wired to the same commands", async () => {
        const addMarkdown = command("Markdown", "primary");
        await mountCanvas({
            cells: [markdownCell("one")],
            cellInsertCommands: [addMarkdown],
        });

        for (const menu of insertMenus()) {
            await click(menu.querySelector("button")!);
        }

        expect(addMarkdown.invoke).toHaveBeenCalledTimes(2);
    });

    it("asks each menu for the commands of the place it inserts at", async () => {
        await mountCanvas({
            cells: [markdownCell("one"), markdownCell("two")],
            cellInsertCommands: [command("Markdown", "primary")],
        });

        expect(insertPositionsAsked).toEqual([0, 1, 2]);
    });

    it("holds a command that is not primary behind the ellipsis", async () => {
        const addMarkdown = command("Markdown", "primary");
        const addCover = command("Cover", "secondary");
        await mountCanvas({
            cells: [],
            cellInsertCommands: [addMarkdown, addCover],
        });

        const menu = insertMenus()[0];
        expect(menu.querySelectorAll("button")).toHaveLength(2);
        expect(
            menu.querySelector(".author-file-editor-insert-cell-menu-dropdown"),
        ).toBeNull();

        await click(menu.querySelectorAll("button")[1]);

        const dropdown = menu.querySelector(
            ".author-file-editor-insert-cell-menu-dropdown",
        )!;
        expect(dropdown).not.toBeNull();
        await click(dropdown.querySelector("button")!);
        expect(addCover.invoke).toHaveBeenCalledTimes(1);
    });

    it("draws no ellipsis when every command is primary", async () => {
        await mountCanvas({
            cells: [],
            cellInsertCommands: [command("Markdown", "primary")],
        });
        expect(
            insertMenus()[0].querySelector(
                ".author-file-editor-insert-cell-menu-overflow",
            ),
        ).toBeNull();
    });
});

describe("invoking a main menu command", () => {
    it("calls the command the button was drawn from", async () => {
        const runAll = command("Run All", "manuscript");
        const viewSource = command("View Source", "view");
        await mountCanvas({ mainMenuCommands: [runAll, viewSource] });

        const buttons = document.querySelectorAll(
            ".author-file-editor-main-menu-tool",
        );
        await click(buttons[1]);

        expect(viewSource.invoke).toHaveBeenCalledTimes(1);
        expect(runAll.invoke).not.toHaveBeenCalled();
    });

    it("draws a button for every command it is given", async () => {
        await mountCanvas({
            mainMenuCommands: [
                command("Run All", "manuscript"),
                command("Export", "transfer"),
                command("View Source", "view"),
            ],
        });
        expect(
            document.querySelectorAll(".author-file-editor-main-menu-tool"),
        ).toHaveLength(3);
    });

    it("separates the categories with one divider between each", async () => {
        await mountCanvas({
            mainMenuCommands: [
                command("Run All", "manuscript"),
                command("Check", "manuscript"),
                command("Export", "transfer"),
                command("View Source", "view"),
            ],
        });
        expect(
            document.querySelectorAll(".author-file-editor-main-menu-divider"),
        ).toHaveLength(2);
    });
});

describe("the commands on a cell", () => {
    it("asks for the commands of the cell it is drawing", async () => {
        await mountCanvas({
            cells: [markdownCell("one"), markdownCell("two")],
            cellCommands: [command("Move up", "cell")],
        });

        expect(cellPositionsAsked).toEqual([0, 1]);
    });

    it("draws one button for each, inside the cell it belongs to", async () => {
        await mountCanvas({
            cells: [markdownCell("one")],
            cellRenderers: { markdown: () => <AuthorFileEditorCell /> },
            cellCommands: [
                command("Move up", "cell"),
                command("Delete", "cell"),
            ],
        });

        expect(
            document.querySelectorAll(
                ".author-file-editor-cell .author-file-editor-cell-actions-button",
            ),
        ).toHaveLength(2);
    });

    it("calls the command the button was drawn from", async () => {
        const moveUp = command("Move up", "cell");
        const remove = command("Delete", "cell");
        await mountCanvas({
            cells: [markdownCell("one")],
            cellRenderers: { markdown: () => <AuthorFileEditorCell /> },
            cellCommands: [moveUp, remove],
        });

        await click(
            document.querySelectorAll(
                ".author-file-editor-cell-actions-button",
            )[1],
        );

        expect(remove.invoke).toHaveBeenCalledTimes(1);
        expect(moveUp.invoke).not.toHaveBeenCalled();
    });
});

describe("a folded cell", () => {
    it("is marked as folded on the page", async () => {
        await mountCanvas({
            cells: [
                markdownCell("one"),
                { kind: "markdown", source: "two", attrs: { folded: "true" } },
            ],
        });

        expect(
            listItems().map((item) =>
                item.classList.contains("author-file-editor-cell-folded"),
            ),
        ).toEqual([false, false, true]);
    });
});
