import { describe, expect, it } from "vitest";

import { InsertCellCommand } from "../../../extension/vscode_runtime/commands/insert_cell";
import { storyOfThreeCells } from "./open_story";

describe("InsertCellCommand — inserts a cell", () => {
    it("puts the new cell where it was asked for", () => {
        const document = storyOfThreeCells();
        new InsertCellCommand().invoke(document, {
            cellIndex: 1,
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

    it("puts a cell at the end when the index is the length of the document", () => {
        const document = storyOfThreeCells();
        new InsertCellCommand().invoke(document, {
            cellIndex: 3,
            newCell: { kind: "note", source: "last", attrs: {} },
        });
        expect(document.cells[3].source).toBe("last");
    });
});
