import { describe, expect, it } from "vitest";

import { MoveCellDownCommand } from "../../../extension/vscode_runtime/commands/move_cell_down";
import { storyOfThreeCells } from "./open_story";

describe("MoveCellDownCommand — moves a cell down", () => {
    it("puts the cell under the one it stood above", () => {
        const document = storyOfThreeCells();
        new MoveCellDownCommand().invoke(document, { cellIndex: 0 });
        expect(document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c2",
            "c1",
            "c3",
        ]);
    });
});
