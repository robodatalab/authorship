import { describe, expect, it } from "vitest";

import { MoveCellDownCommand } from "../../../extension/vscode_runtime/commands/move_cell_down";
import { storyOfThreeCells } from "./open_story";

describe("MoveCellDownCommand — moves a cell down", () => {
    it("puts the cell under the one it stood above", () => {
        const document = storyOfThreeCells();
        new MoveCellDownCommand().invoke(document, { cellId: "c2" });
        expect(document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c1",
            "c3",
            "c2",
        ]);
    });

    it("leaves a chapter holding the whole story where it is", () => {
        const document = storyOfThreeCells();
        new MoveCellDownCommand().invoke(document, { cellId: "c1" });
        expect(document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c1",
            "c2",
            "c3",
        ]);
    });

    it("leaves the last cell where it is, since nothing stands under it", () => {
        const document = storyOfThreeCells();
        new MoveCellDownCommand().invoke(document, { cellId: "c3" });
        expect(document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c1",
            "c2",
            "c3",
        ]);
    });
});
