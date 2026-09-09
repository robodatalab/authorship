import { describe, expect, it } from "vitest";

import { InsertCellCommand } from "../../../extension/vscode_runtime/commands/insert_cell";
import { storyOfThreeCells } from "./open_story";

describe("InsertCellCommand — inserts a cell", () => {
    it("puts the new cell before the one it was asked to precede", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            beforeCellId: "c2",
            cellKind: "note",
        });

        expect(document.cells.map((cell) => cell.kind)).toEqual([
            "chapter",
            "note",
            "markdown",
            "markdown",
        ]);
    });

    it("starts it as a blank of its kind", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            beforeCellId: "c2",
            cellKind: "chapter",
        });

        expect(document.cells[1].attrs.title).toBe("Untitled");
    });

    it("puts it at the end when it precedes no cell at all", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            beforeCellId: null,
            cellKind: "note",
        });

        expect(document.cells[3].kind).toBe("note");
    });

    it("puts it at the top when it precedes the first cell", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            beforeCellId: "c1",
            cellKind: "note",
        });

        expect(document.cells[0].kind).toBe("note");
    });

    it("puts it at the end when it precedes a cell the document has not got", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            beforeCellId: "nowhere",
            cellKind: "note",
        });

        expect(document.cells[3].kind).toBe("note");
    });
});
