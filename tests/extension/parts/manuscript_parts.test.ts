import { describe, expect, it } from "vitest";

import {
    furnitureOf,
    intoParts,
    partCells,
    partFileName,
    partNumber,
    partTitle,
} from "../../../extension/vscode_runtime/parts/manuscript_parts";
import {
    CHAPTER,
    DIVIDER,
    MutableCell,
    MARKDOWN,
    PART,
} from "../../../extension/vscode_runtime/storydoc/model";

function chapter(title: string): MutableCell {
    return new MutableCell(CHAPTER, "", { title });
}

function markdown(source: string): MutableCell {
    return new MutableCell(MARKDOWN, source, {});
}

function part(title: string): MutableCell {
    return new MutableCell(PART, "", { title });
}

function divider(): MutableCell {
    return new MutableCell(DIVIDER, "", {});
}

function titlePage(attrs: Record<string, string>): MutableCell {
    return new MutableCell("title-page", "", attrs);
}

function image(src: string): MutableCell {
    return new MutableCell("image", "", { src });
}

/** Prose of a given length, for a story that has to look like one. */
function prose(words: number): MutableCell {
    return markdown(Array.from({ length: words }, () => "word").join(" "));
}

describe("furnitureOf — what stands before the story and after it", () => {
    it("splits at the first chapter", () => {
        const { front, back } = furnitureOf([
            image("cover.jpg"),
            titlePage({ title: "Veriona" }),
            chapter("One"),
            markdown("alpha"),
            new MutableCell("about", "A. Writer lives by the sea.", {}),
        ]);
        expect(front.map((cell) => cell.kind)).toEqual(["image", "title-page"]);
        expect(back.map((cell) => cell.kind)).toEqual(["about"]);
    });

    it("a story with no chapters has all of its furniture in front", () => {
        const { front, back } = furnitureOf([
            titlePage({ title: "V" }),
            markdown("a"),
        ]);
        expect(front.map((cell) => cell.kind)).toEqual(["title-page"]);
        expect(back).toEqual([]);
    });

    it("takes nothing that is the story", () => {
        const { front, back } = furnitureOf([
            chapter("One"),
            markdown("alpha"),
        ]);
        expect(front).toEqual([]);
        expect(back).toEqual([]);
    });

    it("takes no part of the story, not even the parts it is divided into", () => {
        // A part standing before the first chapter is still the story, and travels
        // with the chapters it names rather than with every part of the book.
        const { front } = furnitureOf([
            titlePage({ title: "Veriona" }),
            part("Day One"),
            chapter("One"),
        ]);
        expect(front.map((cell) => cell.kind)).toEqual(["title-page"]);
    });
});

describe("intoParts — one file per Divider the author placed", () => {
    it("cuts where a divider stands", () => {
        const cells = [
            part("Day One"),
            chapter("One"),
            prose(10),
            divider(),
            chapter("Two"),
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
            chapter("One"),
            markdown("alpha"),
            divider(),
            markdown("beta"),
            chapter("Two"),
        ];
        expect(
            intoParts(cells).map((held) => held.cells.map((cell) => cell.kind)),
        ).toEqual([
            ["chapter", "markdown"],
            ["markdown", "chapter"],
        ]);
    });

    it("writes the divider into neither file", () => {
        const cells = [chapter("One"), divider(), chapter("Two")];
        expect(
            intoParts(cells).flatMap((held) => held.cells.map((c) => c.kind)),
        ).toEqual(["chapter", "chapter"]);
    });

    it("two dividers in a row cut once, leaving no empty file", () => {
        const cells = [chapter("One"), divider(), divider(), chapter("Two")];
        expect(intoParts(cells)).toHaveLength(2);
    });

    it("holds every chapter of a run in one file, however long it runs", () => {
        // Length has nothing to do with it any more: a part is a file because the
        // author said it is one.
        const cells = [
            chapter("One"),
            prose(9000),
            chapter("Two"),
            prose(9000),
            divider(),
            chapter("Three"),
            prose(10),
        ];
        expect(
            intoParts(cells).map(
                (held) =>
                    held.cells.filter((cell) => cell.kind === CHAPTER).length,
            ),
        ).toEqual([2, 1]);
    });

    it("a story with no dividers at all divides into nothing", () => {
        // Nowhere was named as a place to break, and one file holding the whole
        // story is not a division of it.
        const cells = [chapter("One"), prose(10), chapter("Two"), prose(10)];
        expect(intoParts(cells)).toEqual([]);
    });

    it("nothing to divide makes no parts", () => {
        expect(intoParts([])).toEqual([]);
    });

    it("names the part every file stands in", () => {
        const cells = [
            part("Day One"),
            chapter("One"),
            divider(),
            chapter("Two"),
            part("Day Two"),
            divider(),
            chapter("Three"),
        ];
        expect(intoParts(cells).map((held) => held.under)).toEqual([
            "Day One",
            "Day One",
            "Day Two",
        ]);
    });

    it("a file cut before the first part stands under none", () => {
        const cells = [
            chapter("Prologue"),
            prose(10),
            divider(),
            part("Day One"),
            chapter("One"),
            prose(10),
        ];
        expect(intoParts(cells).map((held) => held.under)).toEqual([
            "",
            "Day One",
        ]);
    });

    it("leaves the furniture, the blurb and the story so far out of the story", () => {
        const cells = [
            titlePage({ title: "Veriona" }),
            new MutableCell("recap", "She has lost her name.", {}),
            chapter("One"),
            markdown("alpha"),
            divider(),
            new MutableCell("blurb", "A woman loses her name.", {}),
            chapter("Two"),
            new MutableCell("about", "A. Writer lives by the sea.", {}),
        ];
        expect(
            intoParts(cells).map((held) => held.cells.map((cell) => cell.kind)),
        ).toEqual([
            ["chapter", "markdown"],
            ["chapter"],
        ]);
    });

    it("keeps a note with the chapter it was written under", () => {
        const cells = [
            chapter("One"),
            prose(10),
            new MutableCell("note", "She has to find the letter here.", {}),
            divider(),
            chapter("Two"),
        ];
        expect(intoParts(cells)[0].cells.map((cell) => cell.kind)).toEqual([
            "chapter",
            "markdown",
            "note",
        ]);
    });

    it("every cell lands in exactly one part, in the order it was written", () => {
        const cells = [
            chapter("Prologue"),
            prose(10),
            divider(),
            part("Day One"),
            chapter("One"),
            prose(10),
            divider(),
            chapter("Two"),
            prose(10),
        ];
        const titles = intoParts(cells).flatMap((held) =>
            held.cells
                .filter((cell) => cell.kind === CHAPTER)
                .map((cell) => cell.attrs.title),
        );
        expect(titles).toEqual(["Prologue", "One", "Two"]);
    });

    it("numbers the files across the whole division, not within each part", () => {
        // Every part is one file in one folder, so the numbering is the folder's
        // and the name of the story's part is what tells them apart.
        const cells = [
            part("Day One"),
            chapter("One"),
            prose(10),
            divider(),
            chapter("Two"),
            prose(10),
            divider(),
            part("Day Two"),
            chapter("Three"),
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
    it("carries the furniture around its share of the story", () => {
        const cells = [
            image("cover.jpg"),
            titlePage({ title: "Veriona", subtitle: "A Queendom drama" }),
            chapter("One"),
            markdown("alpha"),
            divider(),
            chapter("Two"),
            markdown("beta"),
            new MutableCell("about", "A. Writer lives by the sea.", {}),
        ];
        const parts = intoParts(cells);
        const second = partCells(furnitureOf(cells), 2, parts[1]);

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
        const note = new MutableCell(
            "note",
            "She has to find the letter here.",
            {},
        );
        const cells = [
            chapter("One"),
            prose(10),
            note,
            divider(),
            chapter("Two"),
            prose(10),
        ];
        const parts = intoParts(cells);

        expect(parts).toHaveLength(2);
        expect(partCells(furnitureOf(cells), 1, parts[0])).toContainEqual(note);
        expect(partCells(furnitureOf(cells), 2, parts[1])).not.toContainEqual(
            note,
        );
    });

    it("renumbers the title page, and leaves the subtitle as it stands", () => {
        const cells = [
            titlePage({ title: "Veriona", subtitle: "A Queendom drama" }),
            divider(),
            chapter("One"),
            markdown("alpha"),
        ];
        const parts = intoParts(cells);
        const only = partCells(furnitureOf(cells), 3, parts[0]);

        expect(only[0].attrs.title).toBe("Veriona — Part 3");
        expect(only[0].attrs.subtitle).toBe("A Queendom drama");
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
            titlePage({ title: "Veriona" }),
            part("Day One"),
            chapter("One"),
            prose(100),
            divider(),
            chapter("Two"),
            prose(100),
        ];
        const parts = intoParts(cells);
        const second = partCells(furnitureOf(cells), 2, parts[1]);

        expect(second[0].attrs.title).toBe("Veriona — Day One — Part 2");
    });

    it("opens the first file with the part the story opens with, and no other", () => {
        const cells = [
            titlePage({ title: "Veriona" }),
            part("Day One"),
            chapter("One"),
            prose(100),
            divider(),
            chapter("Two"),
            prose(100),
        ];
        const parts = intoParts(cells);
        const furniture = furnitureOf(cells);

        expect(
            partCells(furniture, 1, parts[0]).map((cell) => cell.kind),
        ).toEqual(["title-page", "part", "chapter", "markdown"]);
        expect(
            partCells(furniture, 2, parts[1]).map((cell) => cell.kind),
        ).toEqual(["title-page", "chapter", "markdown"]);
    });

    it("points the cover at art that is now a folder away", () => {
        // The parts sit in `parts/`; the art did not move with them.
        const cells = [
            image("art/cover.jpg"),
            divider(),
            chapter("One"),
            markdown("alpha"),
        ];
        const parts = intoParts(cells);
        const only = partCells(furnitureOf(cells), 1, parts[0]);

        expect(only[0].attrs.src).toBe("../art/cover.jpg");
    });

    it("points a picture standing in the prose at art a folder away too", () => {
        const cells = [
            divider(),
            chapter("One"),
            markdown("alpha"),
            image("art/veriona.jpg"),
        ];
        const parts = intoParts(cells);
        const only = partCells(furnitureOf(cells), 1, parts[0]);

        expect(only.map((cell) => cell.kind)).toEqual([
            "chapter",
            "markdown",
            "image",
        ]);
        expect(only[2].attrs.src).toBe("../art/veriona.jpg");
    });

    it("leaves a cover that already says where its art is from", () => {
        for (const src of ["https://art.example/c.jpg", "/shared/art/c.jpg"]) {
            const cells = [image(src), divider(), chapter("One"), markdown("a")];
            const parts = intoParts(cells);
            const only = partCells(furnitureOf(cells), 1, parts[0]);

            expect(only[0].attrs.src, src).toBe(src);
        }
    });

    it("climbs one further out of a path that already climbs", () => {
        // Written from where the story stands, so a part stands one folder deeper.
        const cells = [
            image("../shared/c.jpg"),
            divider(),
            chapter("One"),
            markdown("a"),
        ];
        const parts = intoParts(cells);
        const only = partCells(furnitureOf(cells), 1, parts[0]);

        expect(only[0].attrs.src).toBe("../../shared/c.jpg");
    });

    it("a story with no furniture is a part of nothing but chapters", () => {
        const cells = [
            chapter("One"),
            markdown("alpha"),
            divider(),
            chapter("Two"),
            markdown("beta"),
        ];
        const parts = intoParts(cells);
        expect(
            partCells(furnitureOf(cells), 1, parts[0]).map((c) => c.kind),
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
