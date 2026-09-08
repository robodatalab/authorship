import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { AuthorFileEditorCanvas } from "../../../extension/webview/author_editor/AuthorFileEditorCanvas";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellRun,
} from "../../../extension/webview/author_editor/AuthorFileEditorCell";
import type { AuthorDocumentCellType } from "../../../extension/vscode_runtime/commands/author_document_cell_types";
import type {
    AuthorDocumentCellRenderers,
    WebviewAuthorDocumentCommandCard,
    WebviewCell,
} from "../../../extension/webview/author_editor/AuthorFileEditorCanvas";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface Invocation {
    type: string;
    commandName: string;
    commandArguments: Record<string, unknown>;
}

let posted: Invocation[] = [];

function markdownCell(source: string, id = source): WebviewCell {
    return { kind: "markdown", source, attrs: { id } };
}

const CELL_RENDERERS: AuthorDocumentCellRenderers = {
    markdown: (cell) => <div className="test-cell">{cell.source}</div>,
};

function command(
    commandName: string,
    buttonGroup: string,
): WebviewAuthorDocumentCommandCard {
    return {
        commandName,
        buttonGroup,
        iconClassName: `codicon codicon-${commandName.toLowerCase()}`,
        tooltip: commandName,
    };
}

const INSERT_COMMAND = command("insertCell", "insert");

function cellType(
    cellKind: string,
    insertMenuGroup: string,
): AuthorDocumentCellType {
    return {
        cellKind,
        menuLabel: cellKind,
        insertMenuGroup,
        render: () => null,
        newCell: () => ({ kind: cellKind, source: "", attrs: {} }),
    };
}

async function mountCanvas(options: {
    cells?: WebviewCell[];
    commands?: WebviewAuthorDocumentCommandCard[];
    cellTypes?: AuthorDocumentCellType[];
    cellRenderers?: AuthorDocumentCellRenderers;
}): Promise<void> {
    posted = [];
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
        createRoot(container).render(
            <AuthorFileEditorCanvas
                cells={options.cells ?? []}
                commands={options.commands ?? [INSERT_COMMAND]}
                cellTypes={
                    options.cellTypes ?? [cellType("markdown", "primary")]
                }
                sendMessagesToVscode={(message) =>
                    posted.push(message as Invocation)
                }
                cellRenderers={options.cellRenderers ?? CELL_RENDERERS}
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

    it("draws no menu at all until the host has sent the insert command", async () => {
        await mountCanvas({ cells: [markdownCell("one")], commands: [] });
        expect(insertMenus()).toHaveLength(0);
    });
});

describe("adding a cell", () => {
    it("asks for the kind of cell the button was drawn from", async () => {
        await mountCanvas({
            cells: [markdownCell("one")],
            cellTypes: [
                cellType("markdown", "primary"),
                cellType("chapter", "primary"),
            ],
        });

        await click(insertMenus()[0].querySelectorAll("button")[1]);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "insertCell",
                commandArguments: {
                    afterCellId: null,
                    newCell: { kind: "chapter", source: "", attrs: {} },
                },
            },
        ]);
    });

    it("asks each menu for the cell it inserts after", async () => {
        await mountCanvas({
            cells: [markdownCell("one"), markdownCell("two")],
        });

        for (const menu of insertMenus()) {
            await click(menu.querySelector("button")!);
        }

        expect(
            posted.map((invocation) => invocation.commandArguments.afterCellId),
        ).toEqual([null, "one", "two"]);
    });

    it("holds a kind that is not primary behind the ellipsis", async () => {
        await mountCanvas({
            cells: [],
            cellTypes: [
                cellType("markdown", "primary"),
                cellType("cover", "secondary"),
            ],
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
        expect(posted[0].commandArguments.newCell).toEqual({
            kind: "cover",
            source: "",
            attrs: {},
        });
    });

    it("draws no ellipsis when every kind is primary", async () => {
        await mountCanvas({
            cells: [],
            cellTypes: [cellType("markdown", "primary")],
        });
        expect(
            insertMenus()[0].querySelector(
                ".author-file-editor-insert-cell-menu-overflow",
            ),
        ).toBeNull();
    });
});

describe("invoking a main menu command", () => {
    it("asks for the command the button was drawn from", async () => {
        await mountCanvas({
            commands: [
                command("compile", "manuscript"),
                command("openAsText", "view"),
            ],
        });

        const buttons = document.querySelectorAll(
            ".author-file-editor-main-menu-tool",
        );
        await click(buttons[1]);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "openAsText",
                commandArguments: {},
            },
        ]);
    });

    it("draws a button for every command that belongs in the menu", async () => {
        await mountCanvas({
            commands: [
                command("compile", "manuscript"),
                command("exportMarkdown", "transfer"),
                command("openAsText", "view"),
                command("deleteCell", "cell"),
                INSERT_COMMAND,
            ],
        });
        expect(
            document.querySelectorAll(".author-file-editor-main-menu-tool"),
        ).toHaveLength(3);
    });

    it("leaves out the ones that run a kind of cell, since a cell draws those", async () => {
        await mountCanvas({
            commands: [
                command("compile", "manuscript"),
                { ...command("writeBlurb", "run"), runsCellsOfKind: "blurb" },
            ],
        });
        expect(
            document.querySelectorAll(".author-file-editor-main-menu-tool"),
        ).toHaveLength(1);
    });

    it("separates the categories with one divider between each", async () => {
        await mountCanvas({
            commands: [
                command("compile", "manuscript"),
                command("checkProse", "manuscript"),
                command("exportMarkdown", "transfer"),
                command("openAsText", "view"),
            ],
        });
        expect(
            document.querySelectorAll(".author-file-editor-main-menu-divider"),
        ).toHaveLength(2);
    });
});

describe("the commands on a cell", () => {
    it("draws one button for each, inside the cell it belongs to", async () => {
        await mountCanvas({
            cells: [markdownCell("one")],
            cellRenderers: { markdown: () => <AuthorFileEditorCell /> },
            commands: [
                command("moveCellUp", "cell"),
                command("deleteCell", "cell"),
            ],
        });

        expect(
            document.querySelectorAll(
                ".author-file-editor-cell .author-file-editor-cell-actions-button",
            ),
        ).toHaveLength(2);
    });

    it("asks for the command the button was drawn from", async () => {
        await mountCanvas({
            cells: [markdownCell("one")],
            cellRenderers: { markdown: () => <AuthorFileEditorCell /> },
            commands: [
                command("moveCellUp", "cell"),
                command("deleteCell", "cell"),
            ],
        });

        await click(
            document.querySelectorAll(
                ".author-file-editor-cell-actions-button",
            )[1],
        );

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "deleteCell",
                commandArguments: { cellId: "one" },
            },
        ]);
    });

    it("asks for the cell the button was drawn beside", async () => {
        await mountCanvas({
            cells: [markdownCell("one"), markdownCell("two")],
            cellRenderers: { markdown: () => <AuthorFileEditorCell /> },
            commands: [command("deleteCell", "cell")],
        });

        for (const button of document.querySelectorAll(
            ".author-file-editor-cell-actions-button",
        )) {
            await click(button);
        }

        expect(
            posted.map((invocation) => invocation.commandArguments.cellId),
        ).toEqual(["one", "two"]);
    });
});

describe("the command that runs a cell", () => {
    it("goes to the cell of the kind it runs, and to no other", async () => {
        await mountCanvas({
            cells: [
                markdownCell("one"),
                { kind: "blurb", source: "", attrs: { id: "b1" } },
            ],
            cellRenderers: {
                markdown: () => (
                    <AuthorFileEditorCell
                        sidebar={<AuthorFileEditorCellRun />}
                    />
                ),
                blurb: () => (
                    <AuthorFileEditorCell
                        sidebar={<AuthorFileEditorCellRun />}
                    />
                ),
            },
            commands: [
                { ...command("writeBlurb", "run"), runsCellsOfKind: "blurb" },
            ],
        });

        const runButtons = document.querySelectorAll(
            ".author-file-editor-cell-run",
        );
        expect(runButtons).toHaveLength(1);

        await click(runButtons[0]);

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "writeBlurb",
                commandArguments: { cellId: "b1" },
            },
        ]);
    });
});

describe("two commands drawn as one button", () => {
    const FOLD_COMMANDS: WebviewAuthorDocumentCommandCard[] = [
        {
            commandName: "foldCell",
            buttonGroup: "cell",
            iconClassName: "codicon codicon-fold-up",
            tooltip: "Fold this section away",
            drawnWhenCellAttributeIs: {
                attributeName: "folded",
                attributeValue: "",
            },
        },
        {
            commandName: "unfoldCell",
            buttonGroup: "cell",
            iconClassName: "codicon codicon-fold-down",
            tooltip: "Unfold this section",
            drawnWhenCellAttributeIs: {
                attributeName: "folded",
                attributeValue: "true",
            },
        },
    ];

    async function buttonsBeside(cell: WebviewCell): Promise<string[]> {
        await mountCanvas({
            cells: [cell],
            cellRenderers: { markdown: () => <AuthorFileEditorCell /> },
            commands: FOLD_COMMANDS,
        });
        return [
            ...document.querySelectorAll(
                ".author-file-editor-cell-actions-button",
            ),
        ].map((button) => button.getAttribute("title") ?? "");
    }

    it("draws the one for the state the cell is in", async () => {
        expect(await buttonsBeside(markdownCell("one"))).toEqual([
            "Fold this section away",
        ]);
    });

    it("draws the other one once the cell says otherwise", async () => {
        expect(
            await buttonsBeside({
                kind: "markdown",
                source: "one",
                attrs: { folded: "true" },
            }),
        ).toEqual(["Unfold this section"]);
    });

    it("asks for the command that was drawn, not the one that was not", async () => {
        await mountCanvas({
            cells: [
                {
                    kind: "markdown",
                    source: "one",
                    attrs: { id: "one", folded: "true" },
                },
            ],
            cellRenderers: { markdown: () => <AuthorFileEditorCell /> },
            commands: FOLD_COMMANDS,
        });

        await click(
            document.querySelector(".author-file-editor-cell-actions-button")!,
        );

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "unfoldCell",
                commandArguments: { cellId: "one" },
            },
        ]);
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
