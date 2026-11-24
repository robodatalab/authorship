import { describe, expect, it } from "vitest";

import {
    cellsWithMissingCellsAppended,
    askedBeforeBinding,
    saidAfterLayingOut,
    wordsForWhatIsMissing,
    kindsStillToWrite,
    type BookLayoutReport,
} from "../../../extension/vscode_runtime/publish/book_layout_report";
import {
    CHAPTER,
    ChapterCell,
} from "authordoc/cells/chapter_cell";
import { ImageCell } from "authordoc/cells/image_cell";
import { MarkdownCell } from "authordoc/cells/markdown_cell";
import { UnknownCell } from "authordoc/cells/unknown_cell";

function report(over: Partial<BookLayoutReport> = {}): BookLayoutReport {
    return {
        ready_to_export: false,
        missing_cells: [],
        missing_cell_content: [],
        ...over,
    };
}

describe("cellsWithMissingCellsAppended — the document with a blank for each missing cell", () => {
    it("keeps the author’s own cells in the order they wrote them", () => {
        const cells = [
            new ImageCell("art/mine.png"),
            new ChapterCell("One"),
            new MarkdownCell("The lantern."),
        ];
        const withMissingCells = cellsWithMissingCellsAppended(cells, []);
        expect(withMissingCells).toEqual(cells);
    });

    it("appends a blank for each missing cell, in the order the server names them", () => {
        const chapter = new ChapterCell("One");
        const withMissingCells = cellsWithMissingCellsAppended(
            [chapter],
            ["contents", "about"],
        );
        expect(withMissingCells[0]).toBe(chapter);
        expect(withMissingCells.map((cell) => cell.kind)).toEqual([
            CHAPTER,
            "contents",
            "about",
        ]);
        expect(withMissingCells[1].source).toBe("");
        expect(withMissingCells[2].source).toBe("");
    });

    it("carries a kind it has never heard of", () => {
        const strange = new UnknownCell("epigraph", {}, "Whom the gods…");
        expect(cellsWithMissingCellsAppended([strange], [])).toEqual([strange]);
    });
});

describe("wordsForWhatIsMissing — what a section wants, in the author’s words", () => {
    it("names a field as the server names it", () => {
        expect(wordsForWhatIsMissing(["title", "author"])).toBe(
            "title, author",
        );
    });

    it("says what is wanted when it is not typed into a box", () => {
        expect(wordsForWhatIsMissing(["text"])).toBe("something written in it");
    });
});

describe("askedBeforeBinding — what the author is asked when the book will not bind", () => {
    it("tells the two faults apart", () => {
        const { message, detail } = askedBeforeBinding(
            "story.author",
            report({
                missing_cells: ["contents", "blurb"],
                missing_cell_content: [{ kind: "title-page", needs: ["author", "date"] }],
            }),
        );
        expect(message).toBe("story.author is not ready to bind.");
        expect(detail).toContain("Missing: contents, blurb");
        expect(detail).toContain("title-page needs author, date");
    });

    it("says a section is not filled in even when nothing is missing", () => {
        const { detail } = askedBeforeBinding(
            "story.author",
            report({ missing_cell_content: [{ kind: "title-page", needs: ["author"] }] }),
        );
        expect(detail).not.toContain("Missing:");
        expect(detail).toContain("title-page needs author");
    });

    it("says that fixing does not export, and exporting does not fix", () => {
        const { detail } = askedBeforeBinding(
            "story.author",
            report({ missing_cells: ["contents"] }),
        );
        expect(detail).toContain("It does not export.");
        expect(detail).toContain("Export Anyway binds the book as it stands.");
    });
});

describe("saidAfterLayingOut — what the author is told once it is laid out", () => {
    it("names what was written in and says the rest is marked", () => {
        expect(
            saidAfterLayingOut(
                "story.author",
                report({
                    missing_cells: ["contents", "blurb"],
                    missing_cell_content: [{ kind: "blurb", needs: ["text"] }],
                }),
            ),
        ).toBe(
            "Added contents, blurb in story.author. " +
                "The sections still to write are marked.",
        );
    });

    it("says nothing about marks when nothing is left to write", () => {
        const toldTheAuthor = saidAfterLayingOut(
            "story.author",
            report({ missing_cells: ["contents"] }),
        );
        expect(toldTheAuthor).toBe("Added contents in story.author.");
    });
});

describe("kindsStillToWrite — what the page marks", () => {
    it("is the kinds the server named, and nothing else", () => {
        expect(
            kindsStillToWrite(
                report({
                    missing_cell_content: [
                        { kind: "blurb", needs: ["text"] },
                        { kind: "title-page", needs: ["author"] },
                    ],
                }),
            ),
        ).toEqual(["blurb", "title-page"]);
    });

    it("is empty for a document with everything written", () => {
        expect(kindsStillToWrite(report({ ready_to_export: true }))).toEqual([]);
    });
});
