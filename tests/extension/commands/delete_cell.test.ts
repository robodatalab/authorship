import { describe, expect, it } from "vitest";

import { DeleteCellCommand } from "../../../extension/vscode_runtime/commands/delete_cell";
import { storyOfThreeCells } from "./open_story";

describe("DeleteCellCommand — deletes a cell", () => {
    it("takes out the cell it is given and leaves the rest where they were", () => {
        const document = storyOfThreeCells();
        new DeleteCellCommand().invoke(document, { cellIndex: 1 });
        expect(document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c1",
            "c3",
        ]);
    });

    it("leaves the document alone when there is no cell at that index", () => {
        const document = storyOfThreeCells();
        new DeleteCellCommand().invoke(document, { cellIndex: 9 });
        expect(document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c1",
            "c2",
            "c3",
        ]);
    });
});
