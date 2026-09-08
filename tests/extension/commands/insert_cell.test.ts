import { describe, expect, it } from "vitest";

import { InsertCellCommand } from "../../../extension/vscode_runtime/commands/insert_cell";
import { storyOfThreeCells } from "./open_story";

describe("InsertCellCommand — inserts a cell", () => {
    it("puts the new cell after the one it was asked to follow", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            afterCellId: "c1",
            newCell: { kind: "note", source: "remember this", attrs: {} },
        });

        expect(document.cells.map((cell) => cell.kind)).toEqual([
            "chapter",
            "note",
            "markdown",
            "markdown",
        ]);
        expect(document.cells[1].source).toBe("remember this");
    });

    it("puts it at the top when it follows no cell at all", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            afterCellId: null,
            newCell: { kind: "note", source: "first", attrs: {} },
        });

        expect(document.cells[0].source).toBe("first");
    });

    it("puts it at the end when it follows the last cell", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            afterCellId: "c3",
            newCell: { kind: "note", source: "last", attrs: {} },
        });

        expect(document.cells[3].source).toBe("last");
    });

    it("puts it at the top when it follows a cell the document has not got", () => {
        const document = storyOfThreeCells();

        new InsertCellCommand().invoke(document, {
            afterCellId: "nowhere",
            newCell: { kind: "note", source: "lost", attrs: {} },
        });

        expect(document.cells[0].source).toBe("lost");
    });
});
