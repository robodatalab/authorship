import { describe, expect, it } from "vitest";

import { MoveCellUpCommand } from "../../../extension/vscode_runtime/commands/move_cell_up";
import { storyOfThreeCells } from "./open_story";

describe("MoveCellUpCommand — moves a cell up", () => {
    it("puts the cell above the one it stood under", () => {
        const document = storyOfThreeCells();
        new MoveCellUpCommand().invoke(document, { cellIndex: 2 });
        expect(document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c1",
            "c3",
            "c2",
        ]);
    });

    it("leaves the first cell where it is, since nothing stands above it", () => {
        const document = storyOfThreeCells();
        new MoveCellUpCommand().invoke(document, { cellIndex: 0 });
        expect(document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c1",
            "c2",
            "c3",
        ]);
    });
});
