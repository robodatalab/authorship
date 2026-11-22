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
import type { StoryGeneration } from "../../../extension/vscode_runtime/story_generation";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";
import type { AuthorDocumentCellType } from "../../../extension/vscode_runtime/commands/author_document_cell_types";
import type { WebviewAuthorDocumentCommandCard } from "../../../extension/webview/author_editor/AuthorFileEditorCanvas";
import { MarkdownEditor } from "../../../extension/webview/markdown/MarkdownEditor";
import { AboutCell } from "authordoc/cells/about_cell";
import { BlurbCell } from "authordoc/cells/blurb_cell";
import type { Cell } from "authordoc/cells/cell";
import type { CellVisitor } from "authordoc/cells/cell_visitor";
import { ChapterCell } from "authordoc/cells/chapter_cell";
import { CharacterCell } from "authordoc/cells/character_cell";
import type { DisclaimerCell } from "authordoc/cells/disclaimer_cell";
import type { DividerCell } from "authordoc/cells/divider_cell";
import type { ImageCell } from "authordoc/cells/image_cell";
import { MarkdownCell } from "authordoc/cells/markdown_cell";
import type { NoteCell } from "authordoc/cells/note_cell";
import { PartCell } from "authordoc/cells/part_cell";
import { PlaceCell } from "authordoc/cells/place_cell";
import {
    PlotCell,
    PlotEdge,
    PlotNode,
} from "authordoc/cells/plot_cell";
import type { RecapCell } from "authordoc/cells/recap_cell";
import {
    SalientConceptCell,
    SalientConceptReference,
} from "authordoc/cells/salient_concept_cell";
import { StoryWordRange } from "authordoc/cells/story_word_range";
import type { TableOfContentsCell } from "authordoc/cells/table_of_contents_cell";
import type { TitlePageCell } from "authordoc/cells/title_page_cell";
import type { UnknownCell } from "authordoc/cells/unknown_cell";
import { CellAdded } from "authordoc/changes/cell_added";
import { CellHeaderChanged } from "authordoc/changes/cell_header_changed";
import { CellTextChanged } from "authordoc/changes/cell_text_changed";
import { AuthorDocDiff } from "authordoc/diff";
import { Suggestion } from "authordoc/suggestion";

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

function suggestionThatFolds(source: string): Suggestion {
    const unfolded = markdownCell(source);
    const folded = new MarkdownCell(source, true, null, source);
    const headerChanged = new CellHeaderChanged(unfolded, folded);
    const diff = new AuthorDocDiff([headerChanged]);
    const suggestion = new Suggestion(source, diff);
    return suggestion;
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

    visitCharacter(cell: CharacterCell): ReactNode {
        return this.drawn(cell);
    }

    visitPlace(cell: PlaceCell): ReactNode {
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
    storyGeneration?: StoryGeneration | null;
    suggestions?: Suggestion[];
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
                storyGeneration={options.storyGeneration}
                suggestions={options.suggestions}
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
        ...document.querySelectorAll(".author-file-editor-manuscript-pane > ul > li"),
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
            expect(children[1].firstElementChild?.className).toBe(
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

    it("shows Unfold all when every cell is folded, counting a cell folded by its suggestion, and Fold all otherwise", async () => {
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
                markdownCell("two"),
            ],
            suggestions: [suggestionThatFolds("two")],
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
                command("foldCell", "cell"),
                command("deleteCell", "cell"),
            ],
        });

        expect(
            document.querySelectorAll(
                ".author-file-editor-cell button.author-file-editor-cell-actions-button",
            ),
        ).toHaveLength(2);
    });

    it("asks for the command the button was drawn from", async () => {
        await mountCanvas({
            cells: [markdownCell("one")],
            cellDrawings: { markdown: () => <AuthorFileEditorCell /> },
            commands: [
                command("foldCell", "cell"),
                command("deleteCell", "cell"),
            ],
        });

        await click(
            document.querySelectorAll(
                "button.author-file-editor-cell-actions-button",
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
            "button.author-file-editor-cell-actions-button",
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
                "button.author-file-editor-cell-actions-button",
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
            document.querySelector("button.author-file-editor-cell-actions-button")!,
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
            "li[data-cell-id='c1'] > .author-file-editor-cell-drop-zone > .author-file-editor-insert-cell-menu",
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
            ".author-file-editor-part-scope > li > .author-file-editor-cell-drop-zone > .author-file-editor-insert-cell-menu",
        )!;
        await click(menu.querySelector("button")!);

        expect(posted[0].commandArguments.beforeCellId).toBe("m1");
    });
});

describe("a folded cell", () => {
    it("is drawn folded, also when its suggestion folds it", async () => {
        await mountCanvas({
            cells: [
                markdownCell("one"),
                new MarkdownCell("two", true, null, "two"),
                markdownCell("three"),
            ],
            suggestions: [suggestionThatFolds("three")],
        });

        expect(
            listItems().map((item) =>
                item.classList.contains("author-file-editor-cell-folded"),
            ),
        ).toEqual([false, false, true, true]);
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
                    new PlotCell(
                        "Knocked first",
                        [
                            new PlotNode("n0", null, "1.1", "", [], "Someone knocks."),
                            new PlotNode("n1", new StoryWordRange(0, 1)),
                            new PlotNode("n2", new StoryWordRange(2, 2)),
                            new PlotNode("n3", new StoryWordRange(3, 4)),
                        ],
                        [new PlotEdge("e1", "n1", "n3")],
                        "Someone knocks before the door opens.",
                        false,
                        null,
                        "p4",
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
                selected: "a passage of a plot with an event the story does not tell",
                storyAnnotationsSelected: {
                    plot: { annotationCellId: "p4", passageId: "n1" },
                },
                marks: [
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-color-3",
                        "0",
                        "9",
                    ],
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed author-file-editor-overview-ruler-color-3",
                        "10",
                        "9",
                    ],
                    [
                        "author-file-editor-overview-ruler-mark author-file-editor-overview-ruler-mark-dimmed author-file-editor-overview-ruler-color-3",
                        "150",
                        "9",
                    ],
                ],
                arrows: ["M 16 6.75 H 22 V 152.25 H 16"],
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
                ".author-file-editor-manuscript-pane > ul",
            )!;

            scrolledTo.mockReturnValue(600);
            await act(async () => {
                story.dispatchEvent(new Event("scroll"));
            });

            expect(areaInViewOnTheRuler()).toEqual(["300", "200"]);
        });
    });
});

describe("the metadata and the manuscript panes", () => {
    const DRAWN_BY_THEIR_IDS: CellDrawings = {
        markdown: (cell) => <div className="test-cell">{cell.uniqueId}</div>,
        plot: (cell) => <div className="test-cell">{cell.uniqueId}</div>,
        "salient-concept": (cell) => (
            <div className="test-cell">{cell.uniqueId}</div>
        ),
        character: (cell) => <div className="test-cell">{cell.uniqueId}</div>,
        place: (cell) => <div className="test-cell">{cell.uniqueId}</div>,
    };

    function cellsDrawnIn(pane: string): (string | null)[] {
        return [...document.querySelectorAll(`${pane} .test-cell`)].map(
            (drawn) => drawn.textContent,
        );
    }

    it("labels the metadata pane on the left, with the graph beside it, and the manuscript pane on the right", async () => {
        await mountCanvas({ cellDrawings: DRAWN_BY_THEIR_IDS });

        const metadataTabs = [
            ...document.querySelectorAll(
                ".author-file-editor-metadata-pane .author-file-editor-pane-tab",
            ),
        ].map((tab) => [tab.textContent, tab.getAttribute("aria-selected")]);
        const manuscriptTitle = document.querySelector(
            ".author-file-editor-manuscript-pane .author-file-editor-pane-title",
        )?.textContent;

        expect([metadataTabs, manuscriptTitle]).toEqual([
            [
                ["Metadata", "true"],
                ["Graph", "false"],
            ],
            "Manuscript",
        ]);
    });

    it("highlights the plot of an event clicked in the graph, and shows its words in the manuscript", async () => {
        await mountCanvas({
            cells: [
                markdownCell("Once upon a time", "m1"),
                new PlotCell(
                    "Bell",
                    [new PlotNode("e1", new StoryWordRange(0, 2), "1", "", [], "The bell rings.")],
                    [],
                    "",
                    false,
                    null,
                    "p1",
                ),
            ],
            cellDrawings: DRAWN_BY_THEIR_IDS,
        });
        const graphTab = [
            ...document.querySelectorAll(
                ".author-file-editor-metadata-pane .author-file-editor-pane-tab",
            ),
        ].find((tab) => tab.textContent === "Graph")!;
        await click(graphTab);

        await click(document.querySelector(".author-file-editor-story-graph-event")!);

        expect(posted).toEqual([
            { type: "selectStoryAnnotation", cellKind: "plot", annotationCellId: "p1" },
            { type: "selectPassage", cellKind: "plot", passageId: "e1" },
            { type: "showStoryWordRange", firstWord: 0, lastWord: 2 },
        ]);
    });

    it.each([
        ["Metadata", ["p1", "k1"], false],
        ["Graph", [], true],
    ])("shows in the metadata pane, once %s is chosen, its cells or the graph", async (chosen, cellsShown, graphShown) => {
        await mountCanvas({
            cells: [
                markdownCell("Once", "m1"),
                new PlotCell("Bell", [], [], "", false, null, "p1"),
                new SalientConceptCell("Door", [], "", false, null, "k1"),
            ],
            cellDrawings: DRAWN_BY_THEIR_IDS,
        });
        const tab = [
            ...document.querySelectorAll(
                ".author-file-editor-metadata-pane .author-file-editor-pane-tab",
            ),
        ].find((drawn) => drawn.textContent === chosen)!;

        await click(tab);

        const graph = document.querySelector(
            ".author-file-editor-metadata-pane .author-file-editor-story-graph",
        );
        expect([cellsDrawnIn(".author-file-editor-metadata-pane"), graph !== null]).toEqual([
            cellsShown,
            graphShown,
        ]);
    });

    it.each([
        [".author-file-editor-metadata-pane", ["p1", "k1", "v1", "h1"]],
        [".author-file-editor-manuscript-pane", ["m1", "m2"]],
    ])("draws in %s the cells it holds", async (pane, expected) => {
        await mountCanvas({
            cells: [
                markdownCell("Once", "m1"),
                new PlotCell("Bell", [], [], "", false, null, "p1"),
                markdownCell("Twice", "m2"),
                new SalientConceptCell("Door", [], "", false, null, "k1"),
                new CharacterCell("Varn", "", false, null, "v1"),
                new PlaceCell("The hall", "", false, null, "h1"),
            ],
            cellDrawings: DRAWN_BY_THEIR_IDS,
        });

        expect(cellsDrawnIn(pane)).toEqual(expected);
    });

    it.each([
        [".author-file-editor-metadata-pane", ["plot", "salient-concept", "character", "place"]],
        [".author-file-editor-manuscript-pane", ["markdown", "chapter"]],
    ])("offers in %s the kinds it holds", async (pane, expected) => {
        await mountCanvas({
            cellTypes: [
                cellType("markdown", "primary"),
                cellType("plot", "primary"),
                cellType("chapter", "primary"),
                cellType("salient-concept", "primary"),
                cellType("character", "primary"),
                cellType("place", "primary"),
            ],
            cellDrawings: DRAWN_BY_THEIR_IDS,
        });

        const offered = [
            ...document.querySelectorAll(
                `${pane} .author-file-editor-insert-cell-menu button`,
            ),
        ].map((button) => button.textContent);

        expect(offered).toEqual(expected);
    });

    describe("the splitter between them", () => {
        afterEach(() => vi.restoreAllMocks());

        function canvasDrawnFrom20To1020(): void {
            vi.spyOn(
                HTMLElement.prototype,
                "getBoundingClientRect",
            ).mockReturnValue({ left: 20, width: 1000 } as DOMRect);
        }

        async function drag(clientXs: number[]): Promise<void> {
            const splitter = document.querySelector('[role="separator"]')!;
            await act(async () => {
                splitter.dispatchEvent(
                    new MouseEvent("pointerdown", { bubbles: true }),
                );
            });
            for (const clientX of clientXs) {
                await act(async () => {
                    document.dispatchEvent(
                        new MouseEvent("pointermove", { clientX }),
                    );
                });
            }
        }

        function columns(): string {
            const canvas = document.querySelector<HTMLElement>(
                ".author-file-editor-canvas",
            )!;
            return canvas.style.gridTemplateColumns;
        }

        it.each([
            ["where it is dragged to", 320, "300px auto minmax(0, 1fr) auto"],
            ["no narrower than the narrowest pane", 50, "160px auto minmax(0, 1fr) auto"],
            ["no wider than leaves the manuscript the narrowest pane", 1000, "840px auto minmax(0, 1fr) auto"],
        ])("makes the metadata pane %s", async (_, clientX, expected) => {
            await mountCanvas({ cellDrawings: DRAWN_BY_THEIR_IDS });
            canvasDrawnFrom20To1020();

            await drag([clientX]);

            expect(columns()).toBe(expected);
        });

        it("stops resizing the panes once it is let go", async () => {
            await mountCanvas({ cellDrawings: DRAWN_BY_THEIR_IDS });
            canvasDrawnFrom20To1020();
            await drag([320]);

            await act(async () => {
                document.dispatchEvent(new MouseEvent("pointerup"));
            });
            await act(async () => {
                document.dispatchEvent(
                    new MouseEvent("pointermove", { clientX: 500 }),
                );
            });

            expect(columns()).toBe("300px auto minmax(0, 1fr) auto");
        });

        it("leaves the panes as wide as they are drawn until it is dragged", async () => {
            await mountCanvas({ cellDrawings: DRAWN_BY_THEIR_IDS });

            expect(columns()).toBe("");
        });
    });

    it.each([
        [
            "the button that adds the kind the story generation asks for, at the top of the metadata pane",
            { kind: "command", cellKind: "salient-concept", commandName: "insertCell" },
            [["salient-concept"], []],
        ],
        [
            "no button when the story generation asks for a review",
            { kind: "editor" },
            [[], []],
        ],
    ] as const)("highlights %s", async (_, shown, expected) => {
        await mountCanvas({
            cells: [new PlotCell("Bell", [], [], "", false, null, "p1")],
            cellTypes: [
                cellType("plot", "primary"),
                cellType("salient-concept", "primary"),
            ],
            cellDrawings: DRAWN_BY_THEIR_IDS,
            storyGeneration: {
                running: false,
                progress: { steps: [] },
                stages: [{ name: "concept titles", done: false }],
                asked: { stage: "concept titles", shown },
            },
        });

        const highlighted = [
            ...document.querySelectorAll(
                ".author-file-editor-metadata-pane .author-file-editor-insert-cell-menu",
            ),
        ].map((menu) =>
            [
                ...menu.querySelectorAll(
                    ".author-file-editor-insert-cell-menu-button-highlighted",
                ),
            ].map((button) => button.textContent),
        );

        expect(highlighted).toEqual(expected);
    });

    it("points the author at the button that adds the kind the story generation asks for, saying what to do", async () => {
        await mountCanvas({
            cellTypes: [cellType("salient-concept", "primary")],
            storyGeneration: {
                running: false,
                progress: { steps: [] },
                stages: [{ name: "concept titles", done: false }],
                asked: {
                    stage: "concept titles",
                    shown: { kind: "command", cellKind: "salient-concept", commandName: "insertCell" },
                },
            },
        });

        const bubbles = [
            ...document.querySelectorAll(".author-file-editor-insert-cell-menu-bubble"),
        ].map((bubble) => bubble.textContent);

        expect(bubbles).toEqual([
            "Add every salient-concept your story needs here, then press Continue",
        ]);
    });

    describe("the suggestions on the cells, left for the author to review", () => {
        const ONE_CHANGED = new Suggestion(
            "one",
            new AuthorDocDiff([new CellTextChanged("one", 3, "", ", changed")]),
        );
        const TWO_CHANGED = new Suggestion(
            "two",
            new AuthorDocDiff([new CellTextChanged("two", 3, "", ", changed")]),
        );
        const A_NEW_ONE = new Suggestion(
            "new",
            new AuthorDocDiff([new CellAdded(2, new MarkdownCell("a new one", false, null, "new"))]),
        );

        afterEach(() => vi.restoreAllMocks());

        it("draws every cell with a suggestion as the suggestion makes it, and a cell suggested where it would go, each in a frame with buttons to accept and reject it", async () => {
            await mountCanvas({
                cells: [markdownCell("one"), markdownCell("two")],
                suggestions: [ONE_CHANGED, A_NEW_ONE],
            });

            const drawn = [...document.querySelectorAll(".author-file-editor-manuscript-pane .test-cell")].map(
                (cell) => cell.textContent,
            );
            const suggestionsDrawn = [...document.querySelectorAll(".author-file-editor-suggestion")].map(
                (drawnSuggestion) => [
                    drawnSuggestion.getAttribute("data-suggestion-id"),
                    drawnSuggestion.querySelector(".author-file-editor-suggestion-says")!.textContent,
                    [...drawnSuggestion.querySelectorAll("button")].map((button) => button.getAttribute("aria-label")),
                    drawnSuggestion.querySelector(".author-file-editor-suggestion-proposed")!.textContent,
                ],
            );
            expect([drawn, suggestionsDrawn]).toEqual([
                ["one, changed", "two", "a new one"],
                [
                    ["one", "Suggested change", ["Accept the suggestion", "Reject the suggestion"], "one, changed"],
                    ["new", "Suggested new section", ["Accept the suggestion", "Reject the suggestion"], "a new one"],
                ],
            ]);
        });

        it.each([
            ["accepting", "Accept the suggestion", "accept"],
            ["rejecting", "Reject the suggestion", "reject"],
        ])("%s a suggestion answers for its cell", async (_, label, verdict) => {
            await mountCanvas({
                cells: [markdownCell("one")],
                suggestions: [ONE_CHANGED],
            });
            const button = document.querySelector(
                `[data-suggestion-id="one"] [aria-label="${label}"]`,
            ) as HTMLButtonElement;

            await act(async () => button.click());

            expect(posted).toEqual([
                {
                    type: "invoke",
                    commandName: "reviewTheSuggestion",
                    commandArguments: { cellId: "one", verdict },
                },
            ]);
        });

        it.each([
            ["next", "Next suggestion", ["one", "two", "one"]],
            ["previous", "Previous suggestion", ["two", "one", "two"]],
        ])("brings the %s suggestion into view from the main menu, going round", async (_, label, expected) => {
            const scrollIntoView = vi.fn();
            Element.prototype.scrollIntoView = scrollIntoView;
            await mountCanvas({
                cells: [markdownCell("one"), markdownCell("two")],
                suggestions: [ONE_CHANGED, TWO_CHANGED],
            });
            const button = document.querySelector(
                `.author-file-editor-main-menu [aria-label="${label}"]`,
            ) as HTMLButtonElement;

            await act(async () => button.click());
            await act(async () => button.click());
            await act(async () => button.click());

            const broughtIntoView = scrollIntoView.mock.contexts.map((drawn) =>
                (drawn as Element).getAttribute("data-suggestion-id"),
            );
            expect(broughtIntoView).toEqual(expected);
        });

        it("counts the suggestions in the main menu", async () => {
            await mountCanvas({
                cells: [markdownCell("one"), markdownCell("two")],
                suggestions: [ONE_CHANGED, TWO_CHANGED],
            });

            const counted = document.querySelector(
                ".author-file-editor-main-menu .author-file-editor-suggestion-navigator-count",
            );
            expect(counted?.textContent).toBe("2 suggestions");
        });
    });

    describe("the cells the story generation asks the author to review", () => {
        afterEach(() => vi.restoreAllMocks());

        it.each([
            ["scrolls the metadata pane to the first cell of the kind", { kind: "cells", cellKind: "plot" }, 200],
            ["leaves the metadata pane where it is for a review of the story", { kind: "editor" }, 0],
        ] as const)("%s", async (_, shown, expectedScrollTop) => {
            vi.spyOn(
                HTMLElement.prototype,
                "getBoundingClientRect",
            ).mockImplementation(function (this: HTMLElement) {
                return { top: this.dataset.cellId === "p1" ? 300 : 100 } as DOMRect;
            });

            await mountCanvas({
                cells: [
                    new SalientConceptCell("Door", [], "", false, null, "k1"),
                    new PlotCell("Bell", [], [], "", false, null, "p1"),
                ],
                cellDrawings: DRAWN_BY_THEIR_IDS,
                storyGeneration: {
                    running: false,
                    progress: { steps: [] },
                    stages: [{ name: "plots", done: false }],
                    asked: { stage: "plots", shown },
                },
            });

            const metadata = document.querySelector(
                ".author-file-editor-metadata-pane > ul",
            )!;
            expect(metadata.scrollTop).toBe(expectedScrollTop);
        });
    });

    it("draws no menu in a pane that holds none of the kinds offered", async () => {
        await mountCanvas({ cellDrawings: DRAWN_BY_THEIR_IDS });

        const menus = document.querySelectorAll(
            ".author-file-editor-metadata-pane .author-file-editor-insert-cell-menu",
        );

        expect(menus.length).toBe(0);
    });

    it.each([
        [".author-file-editor-metadata-pane", ["p1", "k1", null]],
        [".author-file-editor-manuscript-pane", ["m1", "m2", "p1"]],
    ])("inserts in %s before what follows each menu", async (pane, expected) => {
        await mountCanvas({
            cells: [
                markdownCell("Once", "m1"),
                markdownCell("Twice", "m2"),
                new PlotCell("Bell", [], [], "", false, null, "p1"),
                new SalientConceptCell("Door", [], "", false, null, "k1"),
            ],
            cellTypes: [
                cellType("markdown", "primary"),
                cellType("plot", "primary"),
            ],
            cellDrawings: DRAWN_BY_THEIR_IDS,
        });

        for (const menu of document.querySelectorAll(
            `${pane} .author-file-editor-insert-cell-menu`,
        )) {
            await click(menu.querySelector("button")!);
        }

        expect(
            posted.map(
                (invocation) => invocation.commandArguments.beforeCellId,
            ),
        ).toEqual(expected);
    });
});

describe("moving cells by dragging them", () => {
    const DRAWN_WITH_THEIR_ACTIONS: CellDrawings = {
        markdown: () => <AuthorFileEditorCell />,
        character: () => <AuthorFileEditorCell />,
        place: () => <AuthorFileEditorCell />,
    };

    const THE_STORY = [
        new PlaceCell("Harrowgate", "", false, null, "hg"),
        new PlaceCell("England", "", false, null, "en"),
        new PlaceCell("Hollowmere", "", false, null, "hv", "en"),
        new PlaceCell("The lane", "", false, null, "ln", "hv"),
        new CharacterCell("Varn", "", false, null, "v1"),
        markdownCell("She saw the door.", "m1"),
    ];

    const FIRST_GAP_OF_THE_METADATA =
        ".author-file-editor-metadata-pane > ul > li:first-child > .author-file-editor-cell-drop-zone";
    const FIRST_GAP_OF_THE_MANUSCRIPT =
        ".author-file-editor-manuscript-pane > ul > li:first-child > .author-file-editor-cell-drop-zone";
    const FIRST_GAP_WITHIN_ENGLAND =
        "li[data-cell-id='en'] > .author-file-editor-place-scope > li:first-child > .author-file-editor-cell-drop-zone";

    async function dragAndDrop(
        draggedId: string,
        droppedOnSelector: string,
    ): Promise<void> {
        const dataTransfer = {
            setData: () => undefined,
            effectAllowed: "",
            dropEffect: "",
        };
        const handle = document.querySelector(
            `li[data-cell-id='${draggedId}'] .author-file-editor-cell-drag-handle`,
        )!;
        const droppedOn = document.querySelector(droppedOnSelector)!;
        await act(async () => {
            const dragStarted = new Event("dragstart", { bubbles: true });
            handle.dispatchEvent(Object.assign(dragStarted, { dataTransfer }));
        });
        await act(async () => {
            const draggedOver = new Event("dragover", { bubbles: true, cancelable: true });
            droppedOn.dispatchEvent(Object.assign(draggedOver, { dataTransfer }));
        });
        await act(async () => {
            const dropped = new Event("drop", { bubbles: true, cancelable: true });
            droppedOn.dispatchEvent(Object.assign(dropped, { dataTransfer }));
        });
    }

    it("draws every place under the place it lies within", async () => {
        await mountCanvas({ cells: THE_STORY, cellDrawings: DRAWN_WITH_THEIR_ACTIONS });

        const nestedUnder = [
            ...document.querySelectorAll(".author-file-editor-place-scope"),
        ].map((scope) => [
            scope.parentElement!.getAttribute("data-cell-id"),
            [...scope.querySelectorAll(":scope > li[data-cell-id]")].map((nested) =>
                nested.getAttribute("data-cell-id"),
            ),
        ]);

        expect(nestedUnder).toEqual([
            ["en", ["hv"]],
            ["hv", ["ln"]],
        ]);
    });

    it.each([
        [
            "a cell dropped in a gap, to stand before the cell after the gap",
            "v1",
            FIRST_GAP_OF_THE_METADATA,
            [{ type: "invoke", commandName: "moveCell", commandArguments: { cellId: "v1", beforeCellId: "hg" } }],
        ],
        [
            "a place dropped in a gap outside every place, out of the place it lies within",
            "ln",
            FIRST_GAP_OF_THE_METADATA,
            [{ type: "invoke", commandName: "movePlace", commandArguments: { placeCellId: "ln", beforeCellId: "hg", parentCellId: "" } }],
        ],
        [
            "a place dropped in a gap within a place, within that place",
            "hg",
            FIRST_GAP_WITHIN_ENGLAND,
            [{ type: "invoke", commandName: "movePlace", commandArguments: { placeCellId: "hg", beforeCellId: "hv", parentCellId: "en" } }],
        ],
        [
            "a place dropped onto a place, within it after the places already in it",
            "hg",
            "li[data-cell-id='hv']",
            [{ type: "invoke", commandName: "movePlace", commandArguments: { placeCellId: "hg", beforeCellId: "v1", parentCellId: "hv" } }],
        ],
        ["nothing for a place dropped onto a place within it", "en", "li[data-cell-id='ln']", []],
        ["nothing for a cell dropped in the other pane", "v1", FIRST_GAP_OF_THE_MANUSCRIPT, []],
        ["nothing for a cell that is not a place dropped within a place", "v1", FIRST_GAP_WITHIN_ENGLAND, []],
        ["nothing for a cell that is not a place dropped onto a place", "v1", "li[data-cell-id='hg']", []],
    ])("asks to move %s", async (_, draggedId, droppedOnSelector, expected) => {
        await mountCanvas({ cells: THE_STORY, cellDrawings: DRAWN_WITH_THEIR_ACTIONS });

        await dragAndDrop(draggedId, droppedOnSelector);

        expect(posted).toEqual(expected);
    });

    it("outlines where the cell dragged would land", async () => {
        await mountCanvas({ cells: THE_STORY, cellDrawings: DRAWN_WITH_THEIR_ACTIONS });
        const dataTransfer = { setData: () => undefined, effectAllowed: "", dropEffect: "" };
        await act(async () => {
            const dragStarted = new Event("dragstart", { bubbles: true });
            document
                .querySelector("li[data-cell-id='hg'] .author-file-editor-cell-drag-handle")!
                .dispatchEvent(Object.assign(dragStarted, { dataTransfer }));
        });

        await act(async () => {
            const draggedOver = new Event("dragover", { bubbles: true, cancelable: true });
            document
                .querySelector("li[data-cell-id='hv']")!
                .dispatchEvent(Object.assign(draggedOver, { dataTransfer }));
        });

        const outlined = [
            ...document.querySelectorAll(".author-file-editor-cell-drop-zone-aimed-at"),
        ].map((aimedAt) => aimedAt.getAttribute("data-cell-id"));
        expect(outlined).toEqual(["hv"]);
    });
});
