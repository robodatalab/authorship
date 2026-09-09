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
                    beforeCellId: "one",
                    cellKind: "chapter",
                },
            },
        ]);
    });

    it("asks each menu for the cell it inserts before", async () => {
        await mountCanvas({
            cells: [markdownCell("one"), markdownCell("two")],
        });

        for (const menu of insertMenus()) {
            await click(menu.querySelector("button")!);
        }

        expect(
            posted.map(
                (invocation) => invocation.commandArguments.beforeCellId,
            ),
        ).toEqual(["one", "two", null]);
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
        expect(posted[0].commandArguments.cellKind).toBe("cover");
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

    it("draws the one of a pair that the folding of the document calls for", async () => {
        const foldAll = {
            ...command("foldAll", "fold"),
            drawnWhenCellAttributeIs: {
                attributeName: "folded",
                attributeValue: "",
            },
        };
        const unfoldAll = {
            ...command("unfoldAll", "fold"),
            drawnWhenCellAttributeIs: {
                attributeName: "folded",
                attributeValue: "true",
            },
        };

        await mountCanvas({
            cells: [markdownCell("one"), markdownCell("two")],
            commands: [foldAll, unfoldAll],
        });
        expect(
            document
                .querySelector(".author-file-editor-main-menu-tool")
                ?.getAttribute("title"),
        ).toBe("foldAll");

        await mountCanvas({
            cells: [
                {
                    kind: "markdown",
                    source: "one",
                    attrs: { id: "one", folded: "true" },
                },
                {
                    kind: "markdown",
                    source: "two",
                    attrs: { id: "two", folded: "true" },
                },
            ],
            commands: [foldAll, unfoldAll],
        });
        expect(
            document
                .querySelector(".author-file-editor-main-menu-tool")
                ?.getAttribute("title"),
        ).toBe("unfoldAll");
    });

    it("draws the first of the pair while the cells disagree", async () => {
        await mountCanvas({
            cells: [
                {
                    kind: "markdown",
                    source: "one",
                    attrs: { id: "one", folded: "true" },
                },
                markdownCell("two"),
            ],
            commands: [
                {
                    ...command("foldAll", "fold"),
                    drawnWhenCellAttributeIs: {
                        attributeName: "folded",
                        attributeValue: "",
                    },
                },
                {
                    ...command("unfoldAll", "fold"),
                    drawnWhenCellAttributeIs: {
                        attributeName: "folded",
                        attributeValue: "true",
                    },
                },
            ],
        });
        expect(
            [
                ...document.querySelectorAll(
                    ".author-file-editor-main-menu-tool",
                ),
            ].map((tool) => tool.getAttribute("title")),
        ).toEqual(["foldAll"]);
    });

    it("draws the first of the pair for a document with no cells in it", async () => {
        await mountCanvas({
            cells: [],
            commands: [
                {
                    ...command("foldAll", "fold"),
                    drawnWhenCellAttributeIs: {
                        attributeName: "folded",
                        attributeValue: "",
                    },
                },
                {
                    ...command("unfoldAll", "fold"),
                    drawnWhenCellAttributeIs: {
                        attributeName: "folded",
                        attributeValue: "true",
                    },
                },
            ],
        });
        expect(
            document
                .querySelector(".author-file-editor-main-menu-tool")
                ?.getAttribute("title"),
        ).toBe("foldAll");
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

describe("folding a part or a chapter", () => {
    function story(folded: Record<string, boolean>): WebviewCell[] {
        return [
            { kind: "part", source: "", attrs: foldedAttributes("p1", folded) },
            {
                kind: "chapter",
                source: "",
                attrs: foldedAttributes("c1", folded),
            },
            { kind: "markdown", source: "one", attrs: { id: "m1" } },
            {
                kind: "chapter",
                source: "",
                attrs: foldedAttributes("c2", folded),
            },
            { kind: "markdown", source: "two", attrs: { id: "m2" } },
            { kind: "part", source: "", attrs: foldedAttributes("p2", folded) },
            { kind: "markdown", source: "three", attrs: { id: "m3" } },
        ];
    }

    function foldedAttributes(
        id: string,
        folded: Record<string, boolean>,
    ): Record<string, string> {
        return folded[id] ? { id, folded: "true" } : { id };
    }

    const CELL_KINDS: AuthorDocumentCellRenderers = {
        part: (cell) => <div className="test-cell">{cell.source}</div>,
        chapter: (cell) => <div className="test-cell">{cell.source}</div>,
        markdown: (cell) => <div className="test-cell">{cell.source}</div>,
    };

    async function cellsDrawn(
        folded: Record<string, boolean>,
    ): Promise<(string | null)[]> {
        await mountCanvas({
            cells: story(folded),
            cellRenderers: CELL_KINDS,
        });
        return [...document.querySelectorAll("li[data-cell-id]")].map((drawn) =>
            drawn.getAttribute("data-cell-id"),
        );
    }

    it("draws every cell while nothing is folded", async () => {
        expect(await cellsDrawn({})).toEqual([
            "p1",
            "c1",
            "m1",
            "c2",
            "m2",
            "p2",
            "m3",
        ]);
    });

    it("folds every chapter of a part away, up to the next part", async () => {
        expect(await cellsDrawn({ p1: true })).toEqual(["p1", "p2", "m3"]);
    });

    it("folds the prose under a chapter away, up to the next chapter", async () => {
        expect(await cellsDrawn({ c1: true })).toEqual([
            "p1",
            "c1",
            "c2",
            "m2",
            "p2",
            "m3",
        ]);
    });

    it("folds the prose under the last part away, to the end", async () => {
        expect(await cellsDrawn({ p2: true })).toEqual([
            "p1",
            "c1",
            "m1",
            "c2",
            "m2",
            "p2",
        ]);
    });

    it("keeps a chapter of a folded part folded away, whatever the chapter says", async () => {
        expect(await cellsDrawn({ p1: true, c1: false })).toEqual([
            "p1",
            "p2",
            "m3",
        ]);
    });
});

describe("the part and the chapter the author is looking at", () => {
    const CELL_KINDS: AuthorDocumentCellRenderers = {
        part: () => <div className="test-cell" />,
        chapter: () => <div className="test-cell" />,
        markdown: () => <div className="test-cell" />,
    };

    let tellWhatIsInView: (entries: IntersectionObserverEntry[]) => void;

    class ObserverTheTestDrives {
        constructor(watch: IntersectionObserverCallback) {
            tellWhatIsInView = (entries) =>
                watch(entries, this as unknown as IntersectionObserver);
        }
        observe(): void {}
        disconnect(): void {}
    }

    async function scrolledTo(...cellIdsInView: string[]): Promise<void> {
        await act(async () => {
            tellWhatIsInView(
                cellIdsInView.map(
                    (cellId) =>
                        ({
                            target: document.querySelector(
                                `li[data-cell-id='${cellId}']`,
                            ),
                            isIntersecting: true,
                        }) as unknown as IntersectionObserverEntry,
                ),
            );
        });
    }

    function said(): string {
        return (
            document.querySelector(".author-file-editor-part-and-chapter-said")
                ?.textContent ?? ""
        );
    }

    async function mountTheStory(): Promise<void> {
        (globalThis as Record<string, unknown>).IntersectionObserver =
            ObserverTheTestDrives;
        await mountCanvas({
            cells: [
                { kind: "part", source: "", attrs: { id: "p1", title: "Book One" } },
                {
                    kind: "chapter",
                    source: "",
                    attrs: { id: "c1", title: "The Door" },
                },
                { kind: "markdown", source: "one", attrs: { id: "m1" } },
            ],
            cellRenderers: CELL_KINDS,
        });
    }

    it("names the chapter the prose in view stands in, not the part alone", async () => {
        await mountTheStory();

        await scrolledTo("p1", "c1", "m1");

        expect(said()).toBe("Book One / The Door");
    });

    it("names the part alone above the first chapter of it", async () => {
        await mountTheStory();

        await scrolledTo("p1");

        expect(said()).toBe("Book One");
    });
});

describe("the scope of a part and of a chapter", () => {
    const CELL_KINDS: AuthorDocumentCellRenderers = {
        part: () => <div className="test-cell" />,
        chapter: () => <div className="test-cell" />,
        markdown: () => <div className="test-cell" />,
    };

    async function mountStory(cells: WebviewCell[]): Promise<void> {
        await mountCanvas({ cells, cellRenderers: CELL_KINDS });
    }

    function cellsWithin(scope: string): string[] {
        return [
            ...document.querySelectorAll(`.${scope} > li[data-cell-id]`),
        ].map((drawn) => drawn.getAttribute("data-cell-id") ?? "");
    }

    it("draws a chapter inside the scope of its part, and the prose inside the chapter's", async () => {
        await mountStory([
            { kind: "part", source: "", attrs: { id: "p1" } },
            { kind: "chapter", source: "", attrs: { id: "c1" } },
            { kind: "markdown", source: "one", attrs: { id: "m1" } },
        ]);

        expect(cellsWithin("author-file-editor-part-scope")).toEqual(["c1"]);
        expect(cellsWithin("author-file-editor-chapter-scope")).toEqual(["m1"]);
    });

    it("holds every kind of section inside the chapter it stands in", async () => {
        await mountStory([
            { kind: "chapter", source: "", attrs: { id: "c1" } },
            { kind: "markdown", source: "one", attrs: { id: "m1" } },
            { kind: "part", source: "", attrs: { id: "p1" } },
        ]);

        expect(cellsWithin("author-file-editor-chapter-scope")).toEqual(["m1"]);
        expect(
            listItems().map((item) => item.getAttribute("data-cell-id")),
        ).toEqual([null, "c1", "p1"]);
    });

    it("leaves what stands before any part or chapter at the top", async () => {
        await mountStory([
            { kind: "markdown", source: "front", attrs: { id: "m0" } },
            { kind: "part", source: "", attrs: { id: "p1" } },
            { kind: "markdown", source: "under", attrs: { id: "m1" } },
        ]);

        expect(
            listItems().map((item) => item.getAttribute("data-cell-id")),
        ).toEqual([null, "m0", "p1"]);
        expect(cellsWithin("author-file-editor-part-scope")).toEqual(["m1"]);
    });

    it("ends the part and the chapter where a page outside the story stands", async () => {
        await mountCanvas({
            cells: [
                { kind: "part", source: "", attrs: { id: "p1" } },
                { kind: "chapter", source: "", attrs: { id: "c1" } },
                { kind: "markdown", source: "one", attrs: { id: "m1" } },
                { kind: "about", source: "", attrs: { id: "a1" } },
                { kind: "markdown", source: "beside", attrs: { id: "m2" } },
            ],
            cellRenderers: {
                ...CELL_KINDS,
                about: () => <div className="test-cell" />,
            },
        });

        expect(
            listItems().map((item) => item.getAttribute("data-cell-id")),
        ).toEqual([null, "p1", "a1", "m2"]);
        expect(cellsWithin("author-file-editor-chapter-scope")).toEqual(["m1"]);
    });

    it("marks the end of the line of a section nothing of its kind follows", async () => {
        await mountStory([
            { kind: "part", source: "", attrs: { id: "p1" } },
            { kind: "chapter", source: "", attrs: { id: "c1" } },
            { kind: "chapter", source: "", attrs: { id: "c2" } },
        ]);

        const scopes = [
            ...document.querySelectorAll("ul[class*='-scope']"),
        ].map((scope) =>
            scope.classList.contains("author-file-editor-scope-ends"),
        );
        expect(scopes).toEqual([true, false, true]);
    });

    it("inserts past the contents a folded section holds, not in front of them", async () => {
        await mountStory([
            {
                kind: "chapter",
                source: "",
                attrs: { id: "c1", folded: "true" },
            },
            { kind: "markdown", source: "one", attrs: { id: "m1" } },
            { kind: "chapter", source: "", attrs: { id: "c2" } },
        ]);

        const menu = document.querySelector(
            "li[data-cell-id='c1'] > .author-file-editor-insert-cell-menu",
        )!;
        expect(menu).not.toBeNull();
        await click(menu.querySelector("button")!);

        expect(posted[0].commandArguments.beforeCellId).toBe("c2");
    });

    it("opens the scope with the menu that inserts before the section's first cell", async () => {
        await mountStory([
            { kind: "part", source: "", attrs: { id: "p1" } },
            { kind: "markdown", source: "one", attrs: { id: "m1" } },
        ]);

        const menu = document.querySelector(
            ".author-file-editor-part-scope > li > .author-file-editor-insert-cell-menu",
        )!;
        await click(menu.querySelector("button")!);

        expect(posted[0].commandArguments.beforeCellId).toBe("m1");
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
