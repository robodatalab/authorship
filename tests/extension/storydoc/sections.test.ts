import { describe, expect, it } from "vitest";

import {
    MutableAuthorDocument,
    type MutableCell,
} from "../../../extension/vscode_runtime/storydoc/model";
import {
    cellsBySection,
    type CellsInASection,
    moveTheSectionDown,
    moveTheSectionUp,
} from "../../../extension/vscode_runtime/storydoc/sections";

function story(...cells: string[]): MutableAuthorDocument {
    return MutableAuthorDocument.fromText(
        cells
            .map((cell) => {
                const [kind, id] = cell.split(" ");
                return `<!-- cell: ${kind} id="${id}" -->\n`;
            })
            .join("\n"),
    );
}

function cellIds(document: MutableAuthorDocument): string[] {
    return document.cells.map((cell) => cell.uniqueId);
}

interface SectionOfCellIds {
    cell: string;
    within: SectionOfCellIds[];
}

function sectionsOf(document: MutableAuthorDocument): SectionOfCellIds[] {
    return byCellId(cellsBySection(document.cells));
}

function byCellId(
    sections: CellsInASection<MutableCell>[],
): SectionOfCellIds[] {
    return sections.map((section) => ({
        cell: section.cell.uniqueId,
        within: byCellId(section.within),
    }));
}

describe("the sections a document reads itself into", () => {
    it("gives a part the chapters under it, and each chapter its prose", () => {
        const sections = sectionsOf(
            story("part p1", "chapter c1", "markdown m1", "chapter c2"),
        );

        expect(sections).toEqual([
            {
                cell: "p1",
                within: [
                    { cell: "c1", within: [{ cell: "m1", within: [] }] },
                    { cell: "c2", within: [] },
                ],
            },
        ]);
    });

    it("ends a part and a chapter alike where a page outside the story stands", () => {
        const sections = sectionsOf(
            story("part p1", "chapter c1", "about a1", "markdown m1"),
        );

        expect(sections).toEqual([
            { cell: "p1", within: [{ cell: "c1", within: [] }] },
            { cell: "a1", within: [] },
            { cell: "m1", within: [] },
        ]);
    });

    it("holds a note under the chapter it was written beside", () => {
        const sections = sectionsOf(story("chapter c1", "note n1"));

        expect(sections).toEqual([
            { cell: "c1", within: [{ cell: "n1", within: [] }] },
        ]);
    });
});

describe("moving a cell, and everything written under it", () => {
    it("takes the cells a chapter holds up along with it", () => {
        const document = story(
            "chapter c1",
            "markdown m1",
            "chapter c2",
            "markdown m2",
        );

        moveTheSectionDown(document, "c1");

        expect(cellIds(document)).toEqual(["c2", "m2", "c1", "m1"]);
    });

    it("takes the chapters a part holds down along with it", () => {
        const document = story(
            "part p1",
            "chapter c1",
            "markdown m1",
            "part p2",
            "chapter c2",
        );

        moveTheSectionDown(document, "p1");

        expect(cellIds(document)).toEqual(["p2", "c2", "p1", "c1", "m1"]);
    });

    it("moves a cell among the ones it stands with, over the whole of each", () => {
        const document = story(
            "part p1",
            "chapter c1",
            "markdown m1",
            "chapter c2",
        );

        moveTheSectionUp(document, "c2");

        expect(cellIds(document)).toEqual(["p1", "c2", "c1", "m1"]);
    });

    it("lifts a cell out of the section it opens the scope of", () => {
        const document = story("chapter c1", "chapter c2", "markdown m1");

        moveTheSectionUp(document, "m1");

        expect(cellIds(document)).toEqual(["c1", "m1", "c2"]);
    });

    it("carries a cell into the next scope where its own has nothing after it", () => {
        const document = story("chapter c1", "markdown m1", "chapter c2");

        moveTheSectionDown(document, "m1");

        expect(cellIds(document)).toEqual(["c1", "c2", "m1"]);
    });

    it("leaves the first cell of the document where it is", () => {
        const document = story("chapter c1", "markdown m1", "chapter c2");

        moveTheSectionUp(document, "c1");

        expect(cellIds(document)).toEqual(["c1", "m1", "c2"]);
    });

    it("leaves the last section of the document where it is", () => {
        const document = story("chapter c1", "chapter c2", "markdown m1");

        moveTheSectionDown(document, "c2");

        expect(cellIds(document)).toEqual(["c1", "c2", "m1"]);
    });

    it("leaves a cell the document has not got where it is", () => {
        const document = story("chapter c1", "markdown m1");

        moveTheSectionDown(document, "nowhere");

        expect(cellIds(document)).toEqual(["c1", "m1"]);
    });
});
