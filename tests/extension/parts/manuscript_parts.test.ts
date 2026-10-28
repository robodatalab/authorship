import { describe, expect, it } from "vitest";

import {
    partBoilerplateOf,
    intoParts,
    partCells,
    partFileName,
    partNumber,
    partTitle,
} from "../../../extension/vscode_runtime/parts/manuscript_parts";
import { AboutCell } from "authordoc/cells/about_cell";
import { BlurbCell } from "authordoc/cells/blurb_cell";
import { ChapterCell } from "authordoc/cells/chapter_cell";
import { DividerCell } from "authordoc/cells/divider_cell";
import { ImageCell } from "authordoc/cells/image_cell";
import { MarkdownCell } from "authordoc/cells/markdown_cell";
import { NoteCell } from "authordoc/cells/note_cell";
import { PartCell } from "authordoc/cells/part_cell";
import { RecapCell } from "authordoc/cells/recap_cell";
import { TitlePageCell } from "authordoc/cells/title_page_cell";

/** Prose of a given length, for a story that has to look like one. */
function prose(words: number): MarkdownCell {
    return new MarkdownCell(
        Array.from({ length: words }, () => "word").join(" "),
    );
}

describe("partBoilerplateOf — what stands before the story and after it", () => {
    it("splits at the first chapter", () => {
        const { front, back } = partBoilerplateOf([
            new ImageCell("cover.jpg"),
            new TitlePageCell("Veriona"),
            new ChapterCell("One"),
            new MarkdownCell("alpha"),
            new AboutCell().withSource("A. Writer lives by the sea."),
        ]);
        expect(front.map((cell) => cell.kind)).toEqual(["image", "title-page"]);
        expect(back.map((cell) => cell.kind)).toEqual(["about"]);
    });

    it("a story with no chapters has all of its part boilerplate in front", () => {
        const { front, back } = partBoilerplateOf([
            new TitlePageCell("V"),
            new MarkdownCell("a"),
        ]);
        expect(front.map((cell) => cell.kind)).toEqual(["title-page"]);
        expect(back).toEqual([]);
    });

    it("takes nothing that is the story", () => {
        const { front, back } = partBoilerplateOf([
            new ChapterCell("One"),
            new MarkdownCell("alpha"),
        ]);
        expect(front).toEqual([]);
        expect(back).toEqual([]);
    });

    it("takes no part of the story, not even the parts it is divided into", () => {
        // A part standing before the first chapter is still the story, and travels
        // with the chapters it names rather than with every part of the book.
        const { front } = partBoilerplateOf([
            new TitlePageCell("Veriona"),
            new PartCell("Day One"),
            new ChapterCell("One"),
        ]);
        expect(front.map((cell) => cell.kind)).toEqual(["title-page"]);
    });
});

describe("intoParts — one file per Divider the author placed", () => {
    it("cuts where a divider stands", () => {
        const cells = [
            new PartCell("Day One"),
            new ChapterCell("One"),
            prose(10),
            new DividerCell(),
            new ChapterCell("Two"),
            prose(10),
        ];
        const parts = intoParts(cells);
        expect(parts).toHaveLength(2);
        expect(
            parts.map((held) => held.cells.map((cell) => cell.kind)),
        ).toEqual([
            ["part", "chapter", "markdown"],
            ["chapter", "markdown"],
        ]);
    });

    it("cuts inside a chapter when that is where the divider stands", () => {
        // The author asked for a file that opens in the middle of a chapter, so
        // that is the file they get.
        const cells = [
            new ChapterCell("One"),
            new MarkdownCell("alpha"),
            new DividerCell(),
            new MarkdownCell("beta"),
            new ChapterCell("Two"),
        ];
        expect(
            intoParts(cells).map((held) => held.cells.map((cell) => cell.kind)),
        ).toEqual([
            ["chapter", "markdown"],
            ["markdown", "chapter"],
        ]);
    });

    it("writes the divider into neither file", () => {
        const cells = [
            new ChapterCell("One"),
            new DividerCell(),
            new ChapterCell("Two"),
        ];
        expect(
            intoParts(cells).flatMap((held) => held.cells.map((c) => c.kind)),
        ).toEqual(["chapter", "chapter"]);
    });

    it("two dividers in a row cut once, leaving no empty file", () => {
        const cells = [
            new ChapterCell("One"),
            new DividerCell(),
            new DividerCell(),
            new ChapterCell("Two"),
        ];
        expect(intoParts(cells)).toHaveLength(2);
    });

    it("holds every chapter of a run in one file, however long it runs", () => {
        // Length has nothing to do with it any more: a part is a file because the
        // author said it is one.
        const cells = [
            new ChapterCell("One"),
            prose(9000),
            new ChapterCell("Two"),
            prose(9000),
            new DividerCell(),
            new ChapterCell("Three"),
            prose(10),
        ];
        expect(
            intoParts(cells).map(
                (held) =>
                    held.cells.filter((cell) => cell instanceof ChapterCell)
                        .length,
            ),
        ).toEqual([2, 1]);
    });

    it("a story with no dividers at all divides into nothing", () => {
        // Nowhere was named as a place to break, and one file holding the whole
        // story is not a division of it.
        const cells = [
            new ChapterCell("One"),
            prose(10),
            new ChapterCell("Two"),
            prose(10),
        ];
        expect(intoParts(cells)).toEqual([]);
    });

    it("nothing to divide makes no parts", () => {
        expect(intoParts([])).toEqual([]);
    });

    it("names the part every file stands in", () => {
        const cells = [
            new PartCell("Day One"),
            new ChapterCell("One"),
            new DividerCell(),
            new ChapterCell("Two"),
            new PartCell("Day Two"),
            new DividerCell(),
            new ChapterCell("Three"),
        ];
        expect(intoParts(cells).map((held) => held.under)).toEqual([
            "Day One",
            "Day One",
            "Day Two",
        ]);
    });

    it("a file cut before the first part stands under none", () => {
        const cells = [
            new ChapterCell("Prologue"),
            prose(10),
            new DividerCell(),
            new PartCell("Day One"),
            new ChapterCell("One"),
            prose(10),
        ];
        expect(intoParts(cells).map((held) => held.under)).toEqual([
            "",
            "Day One",
        ]);
    });

    it("leaves the part boilerplate, the blurb and the story so far out of the story", () => {
        const cells = [
            new TitlePageCell("Veriona"),
            new RecapCell().withSource("She has lost her name."),
            new ChapterCell("One"),
            new MarkdownCell("alpha"),
            new DividerCell(),
            new BlurbCell("A woman loses her name."),
            new ChapterCell("Two"),
            new AboutCell().withSource("A. Writer lives by the sea."),
        ];
        expect(
            intoParts(cells).map((held) => held.cells.map((cell) => cell.kind)),
        ).toEqual([["chapter", "markdown"], ["chapter"]]);
    });

    it("keeps a note with the chapter it was written under", () => {
        const cells = [
            new ChapterCell("One"),
            prose(10),
            new NoteCell("She has to find the letter here."),
            new DividerCell(),
            new ChapterCell("Two"),
        ];
        expect(intoParts(cells)[0].cells.map((cell) => cell.kind)).toEqual([
            "chapter",
            "markdown",
            "note",
        ]);
    });

    it("every cell lands in exactly one part, in the order it was written", () => {
        const cells = [
            new ChapterCell("Prologue"),
            prose(10),
            new DividerCell(),
            new PartCell("Day One"),
            new ChapterCell("One"),
            prose(10),
            new DividerCell(),
            new ChapterCell("Two"),
            prose(10),
        ];
        const titles = intoParts(cells).flatMap((held) =>
            held.cells
                .filter((cell) => cell instanceof ChapterCell)
                .map((cell) => cell.title),
        );
        expect(titles).toEqual(["Prologue", "One", "Two"]);
    });

    it("numbers the files across the whole division, not within each part", () => {
        // Every part is one file in one folder, so the numbering is the folder's
        // and the name of the story's part is what tells them apart.
        const cells = [
            new PartCell("Day One"),
            new ChapterCell("One"),
            prose(10),
            new DividerCell(),
            new ChapterCell("Two"),
            prose(10),
            new DividerCell(),
            new PartCell("Day Two"),
            new ChapterCell("Three"),
            prose(10),
        ];
        const named = intoParts(cells).map((held, at) =>
            partTitle("Veriona", at + 1, held.under),
        );
        expect(named).toEqual([
            "Veriona — Day One — Part 1",
            "Veriona — Day One — Part 2",
            "Veriona — Day Two — Part 3",
        ]);
    });
});

describe("partCells — a part as a document of its own", () => {
    it("carries the part boilerplate around its share of the story", () => {
        const cells = [
            new ImageCell("cover.jpg"),
            new TitlePageCell("Veriona", "A Queendom drama"),
            new ChapterCell("One"),
            new MarkdownCell("alpha"),
            new DividerCell(),
            new ChapterCell("Two"),
            new MarkdownCell("beta"),
            new AboutCell().withSource("A. Writer lives by the sea."),
        ];
        const parts = intoParts(cells);
        const second = partCells(partBoilerplateOf(cells), 2, parts[1]);

        expect(second.map((cell) => cell.kind)).toEqual([
            "image",
            "title-page",
            "chapter",
            "markdown",
            "about",
        ]);
        expect(second[3].source).toBe("beta");
    });

    it("carries a note into the part its chapter went to, and no other", () => {
        const note = new NoteCell("She has to find the letter here.");
        const cells = [
            new ChapterCell("One"),
            prose(10),
            note,
            new DividerCell(),
            new ChapterCell("Two"),
            prose(10),
        ];
        const parts = intoParts(cells);

        expect(parts).toHaveLength(2);
        expect(partCells(partBoilerplateOf(cells), 1, parts[0])).toContainEqual(
            note,
        );
        expect(
            partCells(partBoilerplateOf(cells), 2, parts[1]),
        ).not.toContainEqual(note);
    });

    it("renumbers the title page, and leaves the subtitle as it stands", () => {
        const cells = [
            new TitlePageCell("Veriona", "A Queendom drama"),
            new DividerCell(),
            new ChapterCell("One"),
            new MarkdownCell("alpha"),
        ];
        const parts = intoParts(cells);
        const only = partCells(partBoilerplateOf(cells), 3, parts[0]);

        expect(only[0]).toMatchObject({
            title: "Veriona — Part 3",
            subtitle: "A Queendom drama",
        });
    });

    it("names a part by the story, the part of it it came from, and its number", () => {
        expect(partTitle("Veriona", 3, "Day One")).toBe(
            "Veriona — Day One — Part 3",
        );
        expect(partTitle("Story", 4)).toBe("Story — Part 4");
        expect(partTitle("", 2, "Day One")).toBe("Day One — Part 2");
        expect(partTitle("", 4)).toBe("Part 4");
    });

    it("carries the name of the story’s part onto the title page", () => {
        const cells = [
            new TitlePageCell("Veriona"),
            new PartCell("Day One"),
            new ChapterCell("One"),
            prose(100),
            new DividerCell(),
            new ChapterCell("Two"),
            prose(100),
        ];
        const parts = intoParts(cells);
        const second = partCells(partBoilerplateOf(cells), 2, parts[1]);

        expect(second[0]).toMatchObject({
            title: "Veriona — Day One — Part 2",
        });
    });

    it("opens the first file with the part the story opens with, and no other", () => {
        const cells = [
            new TitlePageCell("Veriona"),
            new PartCell("Day One"),
            new ChapterCell("One"),
            prose(100),
            new DividerCell(),
            new ChapterCell("Two"),
            prose(100),
        ];
        const parts = intoParts(cells);
        const partBoilerplate = partBoilerplateOf(cells);

        expect(
            partCells(partBoilerplate, 1, parts[0]).map((cell) => cell.kind),
        ).toEqual(["title-page", "part", "chapter", "markdown"]);
        expect(
            partCells(partBoilerplate, 2, parts[1]).map((cell) => cell.kind),
        ).toEqual(["title-page", "chapter", "markdown"]);
    });

    it("points the cover at art that is now a folder away", () => {
        // The parts sit in `parts/`; the art did not move with them.
        const cells = [
            new ImageCell("art/cover.jpg"),
            new DividerCell(),
            new ChapterCell("One"),
            new MarkdownCell("alpha"),
        ];
        const parts = intoParts(cells);
        const only = partCells(partBoilerplateOf(cells), 1, parts[0]);

        expect(only[0]).toMatchObject({ src: "../art/cover.jpg" });
    });

    it("points a picture standing in the prose at art a folder away too", () => {
        const cells = [
            new DividerCell(),
            new ChapterCell("One"),
            new MarkdownCell("alpha"),
            new ImageCell("art/veriona.jpg"),
        ];
        const parts = intoParts(cells);
        const only = partCells(partBoilerplateOf(cells), 1, parts[0]);

        expect(only.map((cell) => cell.kind)).toEqual([
            "chapter",
            "markdown",
            "image",
        ]);
        expect(only[2]).toMatchObject({ src: "../art/veriona.jpg" });
    });

    it("leaves a cover that already says where its art is from", () => {
        for (const src of ["https://art.example/c.jpg", "/shared/art/c.jpg"]) {
            const cells = [
                new ImageCell(src),
                new DividerCell(),
                new ChapterCell("One"),
                new MarkdownCell("a"),
            ];
            const parts = intoParts(cells);
            const only = partCells(partBoilerplateOf(cells), 1, parts[0]);

            expect(only[0], src).toMatchObject({ src });
        }
    });

    it("climbs one further out of a path that already climbs", () => {
        // Written from where the story stands, so a part stands one folder deeper.
        const cells = [
            new ImageCell("../shared/c.jpg"),
            new DividerCell(),
            new ChapterCell("One"),
            new MarkdownCell("a"),
        ];
        const parts = intoParts(cells);
        const only = partCells(partBoilerplateOf(cells), 1, parts[0]);

        expect(only[0]).toMatchObject({ src: "../../shared/c.jpg" });
    });

    it("a story with no part boilerplate is a part of nothing but chapters", () => {
        const cells = [
            new ChapterCell("One"),
            new MarkdownCell("alpha"),
            new DividerCell(),
            new ChapterCell("Two"),
            new MarkdownCell("beta"),
        ];
        const parts = intoParts(cells);
        expect(
            partCells(partBoilerplateOf(cells), 1, parts[0]).map((c) => c.kind),
        ).toEqual(["chapter", "markdown"]);
    });
});

describe("partFileName / partNumber — the files a division owns", () => {
    it("writes the parts in the format the story is in", () => {
        expect(partFileName(1)).toBe("part_1.author");
        expect(partFileName(12)).toBe("part_12.author");
    });

    it("reads back which part a file it wrote holds", () => {
        expect(partNumber("part_1.author")).toBe(1);
        expect(partNumber("part_12.author")).toBe(12);
    });

    it("claims nothing else in the folder", () => {
        expect(partNumber("part_one.author")).toBeNull();
        expect(partNumber("notes.author")).toBeNull();
        expect(partNumber("part_1.author.bak")).toBeNull();
        expect(partNumber("draft_part_1.author")).toBeNull();
        expect(partNumber("part_1.md")).toBeNull();
    });

    it("orders a tenth part after a first, which the folder listing would not", () => {
        const names = ["part_10.author", "part_1.author", "part_2.author"];
        const sorted = [...names].sort(
            (a, b) => partNumber(a)! - partNumber(b)!,
        );
        expect(sorted).toEqual([
            "part_1.author",
            "part_2.author",
            "part_10.author",
        ]);
        expect([...names].sort()).toEqual([
            "part_1.author",
            "part_10.author",
            "part_2.author",
        ]);
    });
});
