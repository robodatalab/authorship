import { describe, expect, it } from "vitest";

import {
    cellsLaidOutByPlan,
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
import {
    IMAGE,
    ImageCell,
} from "authordoc/cells/image_cell";
import { MarkdownCell } from "authordoc/cells/markdown_cell";
import { UnknownCell } from "authordoc/cells/unknown_cell";

function report(over: Partial<BookLayoutReport> = {}): BookLayoutReport {
    return {
        ready: false,
        plan: [],
        added: [],
        moved: [],
        wanting: [],
        ...over,
    };
}

describe("cellsLaidOutByPlan — the document laid out as the server planned it", () => {
    it("carries the author’s own cells across by index", () => {
        const authorsOwnCover = new ImageCell("art/mine.png");
        const cells = [new ChapterCell("One"), authorsOwnCover];
        const laidOut = cellsLaidOutByPlan(cells, [
            { kind: IMAGE, at: 1 },
            { kind: CHAPTER, at: 0 },
        ]);
        expect(laidOut[0]).toBe(authorsOwnCover);
        expect(laidOut[1]).toBe(cells[0]);
    });

    it("writes a blank for a section the document has not got", () => {
        const laidOut = cellsLaidOutByPlan(
            [new ChapterCell("One")],
            [
                { kind: "contents", at: null },
                { kind: CHAPTER, at: 0 },
                { kind: "about", at: null },
            ],
        );
        expect(laidOut.map((cell) => cell.kind)).toEqual([
            "contents",
            CHAPTER,
            "about",
        ]);
        expect(laidOut[0].source).toBe("");
        expect(laidOut[2].source).toBe("");
    });

    it("keeps the story in the order the plan gives", () => {
        const cells = [
            new ChapterCell("One"),
            new MarkdownCell("The lantern."),
            new ChapterCell("Two"),
        ];
        const laidOut = cellsLaidOutByPlan(cells, [
            { kind: "contents", at: null },
            { kind: CHAPTER, at: 0 },
            { kind: "markdown", at: 1 },
            { kind: CHAPTER, at: 2 },
        ]);
        expect(laidOut.slice(1)).toEqual(cells);
    });

    it("carries a kind it has never heard of", () => {
        const strange = new UnknownCell("epigraph", {}, "Whom the gods…");
        expect(
            cellsLaidOutByPlan([strange], [{ kind: "epigraph", at: 0 }]),
        ).toEqual([strange]);
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
    it("tells the three faults apart", () => {
        const { message, detail } = askedBeforeBinding(
            "story.author",
            report({
                added: ["contents", "blurb"],
                moved: ["about"],
                wanting: [{ kind: "title-page", needs: ["author", "date"] }],
            }),
        );
        expect(message).toBe("story.author is not ready to bind.");
        expect(detail).toContain("Missing: contents, blurb");
        expect(detail).toContain("Out of place: about");
        expect(detail).toContain("title-page needs author, date");
    });

    it("says a section is not filled in even when nothing is missing", () => {
        const { detail } = askedBeforeBinding(
            "story.author",
            report({ wanting: [{ kind: "title-page", needs: ["author"] }] }),
        );
        expect(detail).not.toContain("Missing:");
        expect(detail).not.toContain("Out of place:");
        expect(detail).toContain("title-page needs author");
    });

    it("says that fixing does not export, and exporting does not fix", () => {
        const { detail } = askedBeforeBinding(
            "story.author",
            report({ added: ["contents"] }),
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
                    added: ["contents", "blurb"],
                    wanting: [{ kind: "blurb", needs: ["text"] }],
                }),
            ),
        ).toBe(
            "Added contents, blurb in story.author. " +
                "The sections still to write are marked.",
        );
    });

    it("reports adding and moving together", () => {
        const toldTheAuthor = saidAfterLayingOut(
            "story.author",
            report({ added: ["contents"], moved: ["about"] }),
        );
        expect(toldTheAuthor).toBe(
            "Added contents and moved about into place in story.author.",
        );
    });

    it("says nothing about marks when nothing is left to write", () => {
        const toldTheAuthor = saidAfterLayingOut(
            "story.author",
            report({ moved: ["about"] }),
        );
        expect(toldTheAuthor).not.toContain("marked");
    });
});

describe("kindsStillToWrite — what the page marks", () => {
    it("is the kinds the server named, and nothing else", () => {
        expect(
            kindsStillToWrite(
                report({
                    wanting: [
                        { kind: "blurb", needs: ["text"] },
                        { kind: "title-page", needs: ["author"] },
                    ],
                }),
            ),
        ).toEqual(["blurb", "title-page"]);
    });

    it("is empty for a document with everything written", () => {
        expect(kindsStillToWrite(report({ ready: true }))).toEqual([]);
    });
});
