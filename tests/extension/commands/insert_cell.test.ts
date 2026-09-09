import { describe, expect, it } from "vitest";

import { InsertCellCommand } from "../../../extension/vscode_runtime/commands/insert_cell";
import { storyOfThreeCells } from "./open_story";

describe("InsertCellCommand — inserts a cell", () => {
    it("puts the new cell after the one it was asked to follow", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            afterCellId: "c1",
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
            afterCellId: "c1",
            cellKind: "chapter",
        });

        expect(document.cells[1].attrs.title).toBe("Untitled");
    });

    it("puts it at the top when it follows no cell at all", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            afterCellId: null,
            cellKind: "note",
        });

        expect(document.cells[0].kind).toBe("note");
    });

    it("puts it at the end when it follows the last cell", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            afterCellId: "c3",
            cellKind: "note",
        });

        expect(document.cells[3].kind).toBe("note");
    });

    it("puts it at the top when it follows a cell the document has not got", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            afterCellId: "nowhere",
            cellKind: "note",
        });

        expect(document.cells[0].kind).toBe("note");
    });
});
