import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { AuthorFileEditorCanvas } from "../../../extension/webview/author_editor/AuthorFileEditorCanvas";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellRun,
    useAuthorFileEditorCellStoryTextClicked,
    useAuthorFileEditorCellStoryTextHighlights,
    useAuthorFileEditorCellStoryTextSelected,
    useAuthorFileEditorCellStoryTextShown,
} from "../../../extension/webview/author_editor/AuthorFileEditorCell";
import type { StoryAnnotationSelected } from "../../../extension/vscode_runtime/story_annotation_selection";
import type { StoryTextSpan } from "../../../extension/library/storydoc/iterators/story_words_iterator";
import type { AuthorDocumentCellType } from "../../../extension/vscode_runtime/commands/author_document_cell_types";
import type { WebviewAuthorDocumentCommandCard } from "../../../extension/webview/author_editor/AuthorFileEditorCanvas";
import { MarkdownEditor } from "../../../extension/webview/markdown/MarkdownEditor";
import { AboutCell } from "../../../extension/library/storydoc/cells/about_cell";
import { BlurbCell } from "../../../extension/library/storydoc/cells/blurb_cell";
import type { Cell } from "../../../extension/library/storydoc/cells/cell";
import type { CellVisitor } from "../../../extension/library/storydoc/cells/cell_visitor";
import { ChapterCell } from "../../../extension/library/storydoc/cells/chapter_cell";
import type { DisclaimerCell } from "../../../extension/library/storydoc/cells/disclaimer_cell";
import type { DividerCell } from "../../../extension/library/storydoc/cells/divider_cell";
import type { ImageCell } from "../../../extension/library/storydoc/cells/image_cell";
import { MarkdownCell } from "../../../extension/library/storydoc/cells/markdown_cell";
import type { NoteCell } from "../../../extension/library/storydoc/cells/note_cell";
import { PartCell } from "../../../extension/library/storydoc/cells/part_cell";
import {
    PlotCell,
    PlotEdge,
    PlotNode,
} from "../../../extension/library/storydoc/cells/plot_cell";
import type { RecapCell } from "../../../extension/library/storydoc/cells/recap_cell";
import {
    SalientConceptCell,
    SalientConceptReference,
} from "../../../extension/library/storydoc/cells/salient_concept_cell";
import { StoryWordRange } from "../../../extension/library/storydoc/cells/story_word_range";
import type { TableOfContentsCell } from "../../../extension/library/storydoc/cells/table_of_contents_cell";
import type { TitlePageCell } from "../../../extension/library/storydoc/cells/title_page_cell";
import type { UnknownCell } from "../../../extension/library/storydoc/cells/unknown_cell";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface Invocation {
    type: string;
    commandName: string;
    commandArguments: Record<string, unknown>;
}

let posted: Invocation[] = [];

function markdownCell(source: string, id = source): MarkdownCell {
    return new MarkdownCell(source, false, null, id);
}

type CellDrawings = Partial<Record<string, (cell: Cell) => ReactNode>>;

class CellsDrawnAs implements CellVisitor<ReactNode> {
    constructor(private readonly drawings: CellDrawings) {}

    visitMarkdown(cell: MarkdownCell): ReactNode {
        return this.drawn(cell);
    }

    visitChapter(cell: ChapterCell): ReactNode {
        return this.drawn(cell);
    }

    visitPart(cell: PartCell): ReactNode {
        return this.drawn(cell);
    }

    visitDivider(cell: DividerCell): ReactNode {
        return this.drawn(cell);
    }

    visitTitlePage(cell: TitlePageCell): ReactNode {
        return this.drawn(cell);
    }

    visitImage(cell: ImageCell): ReactNode {
        return this.drawn(cell);
    }

    visitTableOfContents(cell: TableOfContentsCell): ReactNode {
        return this.drawn(cell);
    }

    visitDisclaimer(cell: DisclaimerCell): ReactNode {
        return this.drawn(cell);
    }

    visitAbout(cell: AboutCell): ReactNode {
        return this.drawn(cell);
    }

    visitBlurb(cell: BlurbCell): ReactNode {
        return this.drawn(cell);
    }

    visitNote(cell: NoteCell): ReactNode {
        return this.drawn(cell);
    }

    visitRecap(cell: RecapCell): ReactNode {
        return this.drawn(cell);
    }

    visitSalientConcept(cell: SalientConceptCell): ReactNode {
        return this.drawn(cell);
    }

    visitPlot(cell: PlotCell): ReactNode {
        return this.drawn(cell);
    }

    visitUnknown(cell: UnknownCell): ReactNode {
        return this.drawn(cell);
    }

    private drawn(cell: Cell): ReactNode {
        const drawing = this.drawings[cell.kind];
        return drawing ? drawing(cell) : null;
    }
}

const CELL_DRAWINGS: CellDrawings = {
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
    };
}

async function mountCanvas(options: {
    cells?: Cell[];
    commands?: WebviewAuthorDocumentCommandCard[];
    cellTypes?: AuthorDocumentCellType[];
    cellDrawings?: CellDrawings;
    storyAnnotationsSelected?: Record<string, StoryAnnotationSelected>;
    storyTextShown?: StoryTextSpan | null;
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
                cellRenderer={
                    new CellsDrawnAs(options.cellDrawings ?? CELL_DRAWINGS)
                }
                storyAnnotationsSelected={options.storyAnnotationsSelected}
                storyTextShown={options.storyTextShown}
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
                new ChapterCell("", "", false, null, "c1"),
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
            drawnWhenTheCellIsFolded: false,
        };
        const unfoldAll = {
            ...command("unfoldAll", "fold"),
            drawnWhenTheCellIsFolded: true,
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
                new MarkdownCell("one", true, null, "one"),
                new MarkdownCell("two", true, null, "two"),
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
                new MarkdownCell("one", true, null, "one"),
                markdownCell("two"),
            ],
            commands: [
                {
                    ...command("foldAll", "fold"),
                    drawnWhenTheCellIsFolded: false,
                },
                {
                    ...command("unfoldAll", "fold"),
                    drawnWhenTheCellIsFolded: true,
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
                    drawnWhenTheCellIsFolded: false,
                },
                {
                    ...command("unfoldAll", "fold"),
                    drawnWhenTheCellIsFolded: true,
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
            cellDrawings: { markdown: () => <AuthorFileEditorCell /> },
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
            cellDrawings: { markdown: () => <AuthorFileEditorCell /> },
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
            cellDrawings: { markdown: () => <AuthorFileEditorCell /> },
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
                new BlurbCell("", false, null, "b1"),
            ],
            cellDrawings: {
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
            drawnWhenTheCellIsFolded: false,
        },
        {
            commandName: "unfoldCell",
            buttonGroup: "cell",
            iconClassName: "codicon codicon-fold-down",
            tooltip: "Unfold this section",
            drawnWhenTheCellIsFolded: true,
        },
    ];

    async function buttonsBeside(cell: Cell): Promise<string[]> {
        await mountCanvas({
            cells: [cell],
            cellDrawings: { markdown: () => <AuthorFileEditorCell /> },
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
            await buttonsBeside(new MarkdownCell("one", true, null, "one")),
        ).toEqual(["Unfold this section"]);
    });

    it("asks for the command that was drawn, not the one that was not", async () => {
        await mountCanvas({
            cells: [
                new MarkdownCell("one", true, null, "one"),
            ],
            cellDrawings: { markdown: () => <AuthorFileEditorCell /> },
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
    function story(folded: Record<string, boolean>): Cell[] {
        return [
            new PartCell("", "", folded.p1 ?? false, null, "p1"),
            new ChapterCell("", "", folded.c1 ?? false, null, "c1"),
            new MarkdownCell("one", false, null, "m1"),
            new ChapterCell("", "", folded.c2 ?? false, null, "c2"),
            new MarkdownCell("two", false, null, "m2"),
            new PartCell("", "", folded.p2 ?? false, null, "p2"),
            new MarkdownCell("three", false, null, "m3"),
        ];
    }

    const CELL_KINDS: CellDrawings = {
        part: (cell) => <div className="test-cell">{cell.source}</div>,
        chapter: (cell) => <div className="test-cell">{cell.source}</div>,
        markdown: (cell) => <div className="test-cell">{cell.source}</div>,
    };

    async function cellsDrawn(
        folded: Record<string, boolean>,
    ): Promise<(string | null)[]> {
        await mountCanvas({
            cells: story(folded),
            cellDrawings: CELL_KINDS,
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
    const CELL_KINDS: CellDrawings = {
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
                new PartCell("Book One", "", false, null, "p1"),
                new ChapterCell("The Door", "", false, null, "c1"),
                new MarkdownCell("one", false, null, "m1"),
            ],
            cellDrawings: CELL_KINDS,
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
    const CELL_KINDS: CellDrawings = {
        part: () => <div className="test-cell" />,
        chapter: () => <div className="test-cell" />,
        markdown: () => <div className="test-cell" />,
    };

    async function mountStory(cells: Cell[]): Promise<void> {
        await mountCanvas({ cells, cellDrawings: CELL_KINDS });
    }

    function cellsWithin(scope: string): string[] {
        return [
            ...document.querySelectorAll(`.${scope} > li[data-cell-id]`),
        ].map((drawn) => drawn.getAttribute("data-cell-id") ?? "");
    }

    it("draws a chapter inside the scope of its part, and the prose inside the chapter's", async () => {
        await mountStory([
            new PartCell("", "", false, null, "p1"),
            new ChapterCell("", "", false, null, "c1"),
            new MarkdownCell("one", false, null, "m1"),
        ]);

        expect(cellsWithin("author-file-editor-part-scope")).toEqual(["c1"]);
        expect(cellsWithin("author-file-editor-chapter-scope")).toEqual(["m1"]);
    });

    it("holds every kind of section inside the chapter it stands in", async () => {
        await mountStory([
            new ChapterCell("", "", false, null, "c1"),
            new MarkdownCell("one", false, null, "m1"),
            new PartCell("", "", false, null, "p1"),
        ]);

        expect(cellsWithin("author-file-editor-chapter-scope")).toEqual(["m1"]);
        expect(
            listItems().map((item) => item.getAttribute("data-cell-id")),
        ).toEqual([null, "c1", "p1"]);
    });

    it("leaves what stands before any part or chapter at the top", async () => {
        await mountStory([
            new MarkdownCell("front", false, null, "m0"),
            new PartCell("", "", false, null, "p1"),
            new MarkdownCell("under", false, null, "m1"),
        ]);

        expect(
            listItems().map((item) => item.getAttribute("data-cell-id")),
        ).toEqual([null, "m0", "p1"]);
        expect(cellsWithin("author-file-editor-part-scope")).toEqual(["m1"]);
    });

    it("ends the part and the chapter where a page outside the story stands", async () => {
        await mountCanvas({
            cells: [
                new PartCell("", "", false, null, "p1"),
                new ChapterCell("", "", false, null, "c1"),
                new MarkdownCell("one", false, null, "m1"),
                new AboutCell("", "", "", "", "", false, null, "a1"),
                new MarkdownCell("beside", false, null, "m2"),
            ],
            cellDrawings: {
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
            new PartCell("", "", false, null, "p1"),
            new ChapterCell("", "", false, null, "c1"),
            new ChapterCell("", "", false, null, "c2"),
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
            new ChapterCell("", "", true, null, "c1"),
            new MarkdownCell("one", false, null, "m1"),
            new ChapterCell("", "", false, null, "c2"),
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
            new PartCell("", "", false, null, "p1"),
            new MarkdownCell("one", false, null, "m1"),
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
                new MarkdownCell("two", true, null, "two"),
            ],
        });

        expect(
            listItems().map((item) =>
                item.classList.contains("author-file-editor-cell-folded"),
            ),
        ).toEqual([false, false, true]);
    });
});

describe("the salient concepts the story holds", () => {
    const THE_DOOR = new SalientConceptCell(
        "Door",
        [new SalientConceptReference("r1", new StoryWordRange(1, 2))],
        "What she saw.",
        false,
        null,
        "k1",
    );

    function SelectsTheDoor() {
        const storyTextSelected = useAuthorFileEditorCellStoryTextSelected();
        const storyTextHighlights =
            useAuthorFileEditorCellStoryTextHighlights();
        const { storyTextShown } = useAuthorFileEditorCellStoryTextShown();
        return (
            <button
                className="test-select-the-door"
                data-highlights={JSON.stringify(storyTextHighlights ?? [])}
                data-shown={JSON.stringify(storyTextShown ?? null)}
                onClick={() => storyTextSelected(4, 8)}
            />
        );
    }

    function highlightsDrawnOnTheStory(): unknown {
        return JSON.parse(
            (
                document.querySelector(
                    ".test-select-the-door",
                ) as HTMLElement
            ).dataset.highlights!,
        );
    }

    it("highlights none of the words until a concept is selected", async () => {
        await mountCanvas({
            cells: [markdownCell("The door opens.", "m1"), THE_DOOR],
            cellDrawings: { markdown: () => <SelectsTheDoor /> },
        });

        expect(highlightsDrawnOnTheStory()).toEqual([]);
    });

    it("highlights the selected concept's words in its colour", async () => {
        await mountCanvas({
            cells: [markdownCell("The door opens.", "m1"), THE_DOOR],
            cellDrawings: { markdown: () => <SelectsTheDoor /> },
            storyAnnotationsSelected: {
                "salient-concept": { annotationCellId: "k1", passageId: null },
            },
        });

        expect(highlightsDrawnOnTheStory()).toEqual([
            {
                startCharacterOffsetInCell: 4,
                endCharacterOffsetInCell: 15,
                highlightColor: 0,
                emphasized: false,
            },
        ]);
    });

    it("shows the cell the words the host asks to be shown", async () => {
        await mountCanvas({
            cells: [markdownCell("The door opens.", "m1"), THE_DOOR],
            cellDrawings: { markdown: () => <SelectsTheDoor /> },
            storyTextShown: {
                cellId: "m1",
                startCharacterOffsetInCell: 4,
                endCharacterOffsetInCell: 15,
            },
        });

        expect(
            JSON.parse(
                (
                    document.querySelector(
                        ".test-select-the-door",
                    ) as HTMLElement
                ).dataset.shown!,
            ),
        ).toEqual({
            cellId: "m1",
            startCharacterOffsetInCell: 4,
            endCharacterOffsetInCell: 15,
        });
    });

    it("tells the host which words the author selected", async () => {
        await mountCanvas({
            cells: [markdownCell("The door opens.", "m1"), THE_DOOR],
            cellDrawings: { markdown: () => <SelectsTheDoor /> },
        });

        await click(document.querySelector(".test-select-the-door")!);

        expect(posted).toEqual([
            {
                type: "storyTextSelected",
                storyTextSelected: {
                    cellId: "m1",
                    startCharacterOffsetInCell: 4,
                    endCharacterOffsetInCell: 8,
                },
            },
        ]);
    });
});

describe("the plots the story weaves", () => {
    const THE_BELL = new PlotCell(
        "The bell",
        [new PlotNode("n1", new StoryWordRange(0, 0))],
        [],
        "He hears the bell.",
        false,
        null,
        "p1",
    );
    const THE_DOOR = new PlotCell(
        "The door",
        [
            new PlotNode("n1", new StoryWordRange(2, 2)),
            new PlotNode("n2", new StoryWordRange(0, 1)),
        ],
        [],
        "She opens the door.",
        false,
        null,
        "p2",
    );

    function ShowsTheHighlights() {
        const storyTextHighlights =
            useAuthorFileEditorCellStoryTextHighlights();
        return (
            <div
                className="test-highlights"
                data-highlights={JSON.stringify(storyTextHighlights ?? [])}
            />
        );
    }

    it("highlights none of the words until a plot is selected", async () => {
        await mountCanvas({
            cells: [markdownCell("The door opens.", "m1"), THE_BELL, THE_DOOR],
            cellDrawings: { markdown: () => <ShowsTheHighlights /> },
        });

        const highlightsDrawn = document.querySelector<HTMLElement>(
            ".test-highlights",
        )!.dataset.highlights!;
        expect(JSON.parse(highlightsDrawn)).toEqual([]);
    });

    it("highlights every span of the selected plot's trajectory in its colour", async () => {
        await mountCanvas({
            cells: [markdownCell("The door opens.", "m1"), THE_BELL, THE_DOOR],
            cellDrawings: { markdown: () => <ShowsTheHighlights /> },
            storyAnnotationsSelected: {
                plot: { annotationCellId: "p2", passageId: null },
            },
        });

        const highlightsDrawn = document.querySelector<HTMLElement>(
            ".test-highlights",
        )!.dataset.highlights!;
        expect(JSON.parse(highlightsDrawn)).toEqual([
            {
                startCharacterOffsetInCell: 9,
                endCharacterOffsetInCell: 15,
                highlightColor: 1,
                emphasized: false,
            },
            {
                startCharacterOffsetInCell: 0,
                endCharacterOffsetInCell: 8,
                highlightColor: 1,
                emphasized: false,
            },
        ]);
    });

    it("emphasizes the passage selected", async () => {
        await mountCanvas({
            cells: [markdownCell("The door opens.", "m1"), THE_BELL, THE_DOOR],
            cellDrawings: { markdown: () => <ShowsTheHighlights /> },
            storyAnnotationsSelected: {
                plot: { annotationCellId: "p2", passageId: "n2" },
            },
        });

        const highlightsDrawn = document.querySelector<HTMLElement>(
            ".test-highlights",
        )!.dataset.highlights!;
        expect(JSON.parse(highlightsDrawn)).toEqual([
            {
                startCharacterOffsetInCell: 9,
                endCharacterOffsetInCell: 15,
                highlightColor: 1,
                emphasized: false,
            },
            {
                startCharacterOffsetInCell: 0,
                endCharacterOffsetInCell: 8,
                highlightColor: 1,
                emphasized: true,
            },
        ]);
    });

    function ClicksTheStoryText({ clickedAt }: { clickedAt: number }) {
        const storyTextClicked = useAuthorFileEditorCellStoryTextClicked();
        return (
            <button
                className="test-click-the-story-text"
                onClick={() => storyTextClicked(clickedAt)}
            />
        );
    }

    it.each([
        { clicked: "inside the plot's first passage", clickedAt: 10, passageId: "n1" },
        { clicked: "inside the plot's second passage", clickedAt: 2, passageId: "n2" },
    ])(
        "asks the host to select the passage when the author clicks $clicked",
        async ({ clickedAt, passageId }) => {
            await mountCanvas({
                cells: [
                    markdownCell("The door opens.", "m1"),
                    THE_BELL,
                    THE_DOOR,
                ],
                cellDrawings: {
                    markdown: () => <ClicksTheStoryText clickedAt={clickedAt} />,
                },
                storyAnnotationsSelected: {
                    plot: { annotationCellId: "p2", passageId: null },
                },
            });
            const storyText = document.querySelector(
                ".test-click-the-story-text",
            )!;

            await click(storyText);

            expect(posted).toEqual([
                { type: "selectPassage", cellKind: "plot", passageId },
            ]);
        },
    );

    it("asks the host to select the passage of every annotation selected that the author clicks", async () => {
        await mountCanvas({
            cells: [
                markdownCell("The door opens.", "m1"),
                new SalientConceptCell(
                    "Door",
                    [new SalientConceptReference("r1", new StoryWordRange(0, 1))],
                    "What she saw.",
                    false,
                    null,
                    "k1",
                ),
                THE_BELL,
                THE_DOOR,
            ],
            cellDrawings: {
                markdown: () => <ClicksTheStoryText clickedAt={2} />,
            },
            storyAnnotationsSelected: {
                "salient-concept": { annotationCellId: "k1", passageId: null },
                plot: { annotationCellId: "p2", passageId: null },
            },
        });
        const storyText = document.querySelector(
            ".test-click-the-story-text",
        )!;

        await click(storyText);

        expect(posted).toEqual([
            { type: "selectPassage", cellKind: "salient-concept", passageId: "r1" },
            { type: "selectPassage", cellKind: "plot", passageId: "n2" },
        ]);
    });

    it.each<{
        clicked: string;
        storyAnnotationsSelected: Record<string, StoryAnnotationSelected>;
        clickedAt: number;
    }>([
        {
            clicked: "outside every passage of the plot",
            storyAnnotationsSelected: {
                plot: { annotationCellId: "p1", passageId: null },
            },
            clickedAt: 10,
        },
        {
            clicked: "with no plot selected",
            storyAnnotationsSelected: {},
            clickedAt: 10,
        },
    ])(
        "selects no passage when the author clicks $clicked",
        async ({ storyAnnotationsSelected, clickedAt }) => {
            await mountCanvas({
                cells: [
                    markdownCell("The door opens.", "m1"),
                    THE_BELL,
                    THE_DOOR,
                ],
                cellDrawings: {
                    markdown: () => <ClicksTheStoryText clickedAt={clickedAt} />,
                },
                storyAnnotationsSelected,
            });
            const storyText = document.querySelector(
                ".test-click-the-story-text",
            )!;

            await click(storyText);

            expect(posted).toEqual([]);
        },
    );

    describe("the overview ruler beside the story", () => {
        const MARKED = "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-color-0";
        const MARKED_DIMMED =
            "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed author-file-editor-overview-ruler-color-0";
        const WHERE_THE_WORDS_ARE_DRAWN: Record<string, DOMRect[]> = {
            "opens.": [
                { left: 100, right: 150, top: 20, bottom: 38 } as DOMRect,
            ],
            "The door": [
                { left: 0, right: 60, top: 0, bottom: 18 } as DOMRect,
            ],
            "He heard": [
                { left: 10, right: 70, top: 300, bottom: 318 } as DOMRect,
            ],
        };

        afterEach(() => vi.restoreAllMocks());

        function storyDrawnTwiceAsTallAsTheRuler(): void {
            vi.spyOn(Range.prototype, "getClientRects").mockImplementation(
                function (this: Range) {
                    const wordsDrawn = this.toString();
                    return (WHERE_THE_WORDS_ARE_DRAWN[wordsDrawn] ??
                        []) as unknown as DOMRectList;
                },
            );
            vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
                { left: 0, top: 0, width: 32, height: 500 } as DOMRect,
            );
            vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
                1000,
            );
        }

        async function mountTheStoryOfTheDoor(
            storyAnnotationsSelected: Record<string, StoryAnnotationSelected>,
        ): Promise<void> {
            await mountCanvas({
                cells: [
                    markdownCell("The door opens.", "m1"),
                    markdownCell("He heard it.", "m2"),
                    new SalientConceptCell(
                        "Hearing",
                        [
                            new SalientConceptReference("r1", new StoryWordRange(0, 1)),
                            new SalientConceptReference("r2", new StoryWordRange(3, 4)),
                        ],
                        "What he heard.",
                        false,
                        null,
                        "k1",
                    ),
                    new PlotCell(
                        "The door",
                        [
                            new PlotNode("n1", new StoryWordRange(2, 2)),
                            new PlotNode("n2", new StoryWordRange(0, 1)),
                            new PlotNode("n3", new StoryWordRange(3, 4)),
                        ],
                        [
                            new PlotEdge("e1", "n1", "n2"),
                            new PlotEdge("e2", "n2", "n3"),
                        ],
                        "The door opens to the bell.",
                        false,
                        null,
                        "p1",
                    ),
                    new PlotCell(
                        "In order",
                        [
                            new PlotNode("n1", new StoryWordRange(0, 1)),
                            new PlotNode("n2", new StoryWordRange(2, 2)),
                            new PlotNode("n3", new StoryWordRange(3, 4)),
                        ],
                        [
                            new PlotEdge("e1", "n1", "n2"),
                            new PlotEdge("e2", "n2", "n3"),
                        ],
                        "The door opens, then he hears it.",
                        false,
                        null,
                        "p2",
                    ),
                    new PlotCell(
                        "Told backwards",
                        [
                            new PlotNode("n1", new StoryWordRange(0, 1)),
                            new PlotNode("n2", new StoryWordRange(2, 2)),
                            new PlotNode("n3", new StoryWordRange(3, 4)),
                        ],
                        [new PlotEdge("e1", "n3", "n1")],
                        "He heard it before the door opened.",
                        false,
                        null,
                        "p3",
                    ),
                ],
                cellDrawings: {
                    markdown: (cell) => (
                        <MarkdownEditor
                            cellId={cell.uniqueId}
                            markdown={cell.source}
                            onMarkdownCommitted={() => undefined}
                        />
                    ),
                },
                storyAnnotationsSelected,
            });
        }

        function marksOnTheRuler(): (string | null)[][] {
            const marks = [
                ...document.querySelectorAll(
                    ".author-file-editor-overview-ruler-mark",
                ),
            ];
            return marks.map((mark) => [
                mark.getAttribute("class"),
                mark.getAttribute("y"),
                mark.getAttribute("height"),
            ]);
        }

        function arrowsOnTheRuler(): (string | null)[] {
            const arrows = [
                ...document.querySelectorAll(
                    ".author-file-editor-overview-ruler-arrow-line",
                ),
            ];
            return arrows.map((arrow) => arrow.getAttribute("d"));
        }

        it.each<{
            selected: string;
            storyAnnotationsSelected: Record<string, StoryAnnotationSelected>;
            marks: string[][];
            arrows: string[];
        }>([
            {
                selected: "nothing",
                storyAnnotationsSelected: {},
                marks: [],
                arrows: [],
            },
            {
                selected: "a concept",
                storyAnnotationsSelected: {
                    "salient-concept": { annotationCellId: "k1", passageId: null },
                },
                marks: [
                    [MARKED, "0", "9"],
                    [MARKED, "150", "9"],
                ],
                arrows: [],
            },
            {
                selected: "a concept and one of its examples",
                storyAnnotationsSelected: {
                    "salient-concept": { annotationCellId: "k1", passageId: "r2" },
                },
                marks: [
                    [MARKED_DIMMED, "0", "9"],
                    [MARKED, "150", "9"],
                ],
                arrows: [],
            },
            {
                selected: "a plot",
                storyAnnotationsSelected: {
                    plot: { annotationCellId: "p1", passageId: null },
                },
                marks: [
                    [MARKED, "10", "9"],
                    [MARKED, "0", "9"],
                    [MARKED, "150", "9"],
                ],
                arrows: [],
            },
            {
                selected: "the first passage of a plot",
                storyAnnotationsSelected: {
                    plot: { annotationCellId: "p1", passageId: "n1" },
                },
                marks: [
                    [MARKED, "10", "9"],
                    [MARKED_DIMMED, "0", "9"],
                    [MARKED_DIMMED, "150", "9"],
                ],
                arrows: ["M 16 16.75 H 22 V 2.25 H 16"],
            },
            {
                selected: "the second passage of a plot",
                storyAnnotationsSelected: {
                    plot: { annotationCellId: "p1", passageId: "n2" },
                },
                marks: [
                    [MARKED_DIMMED, "10", "9"],
                    [MARKED, "0", "9"],
                    [MARKED_DIMMED, "150", "9"],
                ],
                arrows: [
                    "M 16 16.75 H 22 V 2.25 H 16",
                    "M 16 6.75 H 28 V 152.25 H 16",
                ],
            },
            {
                selected: "the middle passage of a plot told in order",
                storyAnnotationsSelected: {
                    plot: { annotationCellId: "p2", passageId: "n2" },
                },
                marks: [
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed author-file-editor-overview-ruler-color-1",
                        "0",
                        "9",
                    ],
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-color-1",
                        "10",
                        "9",
                    ],
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed author-file-editor-overview-ruler-color-1",
                        "150",
                        "9",
                    ],
                ],
                arrows: [
                    "M 16 6.75 H 22 V 12.25 H 16",
                    "M 16 16.75 H 22 V 152.25 H 16",
                ],
            },
            {
                selected: "the last passage of a plot",
                storyAnnotationsSelected: {
                    plot: { annotationCellId: "p1", passageId: "n3" },
                },
                marks: [
                    [MARKED_DIMMED, "10", "9"],
                    [MARKED_DIMMED, "0", "9"],
                    [MARKED, "150", "9"],
                ],
                arrows: ["M 16 6.75 H 22 V 152.25 H 16"],
            },
            {
                selected: "the passage of a plot that leads back to an earlier one",
                storyAnnotationsSelected: {
                    plot: { annotationCellId: "p3", passageId: "n3" },
                },
                marks: [
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed author-file-editor-overview-ruler-color-2",
                        "0",
                        "9",
                    ],
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed author-file-editor-overview-ruler-color-2",
                        "10",
                        "9",
                    ],
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-color-2",
                        "150",
                        "9",
                    ],
                ],
                arrows: ["M 16 156.75 H 22 V 2.25 H 16"],
            },
            {
                selected: "the passage of a plot that nothing connects",
                storyAnnotationsSelected: {
                    plot: { annotationCellId: "p3", passageId: "n2" },
                },
                marks: [
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed author-file-editor-overview-ruler-color-2",
                        "0",
                        "9",
                    ],
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-color-2",
                        "10",
                        "9",
                    ],
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed author-file-editor-overview-ruler-color-2",
                        "150",
                        "9",
                    ],
                ],
                arrows: [],
            },
            {
                selected: "a concept and a passage of a plot",
                storyAnnotationsSelected: {
                    "salient-concept": { annotationCellId: "k1", passageId: null },
                    plot: { annotationCellId: "p1", passageId: "n2" },
                },
                marks: [
                    [MARKED, "0", "9"],
                    [MARKED, "150", "9"],
                    [MARKED_DIMMED, "10", "9"],
                    [MARKED, "0", "9"],
                    [MARKED_DIMMED, "150", "9"],
                ],
                arrows: [
                    "M 16 16.75 H 22 V 2.25 H 16",
                    "M 16 6.75 H 28 V 152.25 H 16",
                ],
            },
        ])(
            "marks the passages, and points along a plot's trajectory, when $selected is selected",
            async ({ storyAnnotationsSelected, marks, arrows }) => {
                storyDrawnTwiceAsTallAsTheRuler();

                await mountTheStoryOfTheDoor(storyAnnotationsSelected);

                expect(marksOnTheRuler()).toEqual(marks);
                expect(arrowsOnTheRuler()).toEqual(arrows);
            },
        );

        function areaInViewOnTheRuler(): (string | null)[] {
            const areaInView = document.querySelector(
                ".author-file-editor-overview-ruler-area-in-view",
            )!;
            return [
                areaInView.getAttribute("y"),
                areaInView.getAttribute("height"),
            ];
        }

        it("shows the part of the story in view", async () => {
            storyDrawnTwiceAsTallAsTheRuler();
            vi.spyOn(HTMLElement.prototype, "scrollTop", "get").mockReturnValue(
                200,
            );
            vi.spyOn(
                HTMLElement.prototype,
                "clientHeight",
                "get",
            ).mockReturnValue(400);

            await mountTheStoryOfTheDoor({});

            expect(areaInViewOnTheRuler()).toEqual(["100", "200"]);
        });

        it("follows the story as the author scrolls it", async () => {
            storyDrawnTwiceAsTallAsTheRuler();
            const scrolledTo = vi
                .spyOn(HTMLElement.prototype, "scrollTop", "get")
                .mockReturnValue(0);
            vi.spyOn(
                HTMLElement.prototype,
                "clientHeight",
                "get",
            ).mockReturnValue(400);
            await mountTheStoryOfTheDoor({});
            const story = document.querySelector(
                ".author-file-editor-canvas > ul",
            )!;

            scrolledTo.mockReturnValue(600);
            await act(async () => {
                story.dispatchEvent(new Event("scroll"));
            });

            expect(areaInViewOnTheRuler()).toEqual(["300", "200"]);
        });
    });
});
