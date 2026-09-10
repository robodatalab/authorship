import { describe, expect, it } from "vitest";

import { MoveCellUpCommand } from "../../../extension/vscode_runtime/commands/move_cell_up";
import { storyOfThreeCells } from "./open_story";

describe("MoveCellUpCommand — moves a cell up", () => {
    it("puts the cell above the one it stood under", () => {
        const session = storyOfThreeCells();
        new MoveCellUpCommand().invoke(session, { cellId: "c3" });
        expect(session.document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c1",
            "c3",
            "c2",
        ]);
    });

    it("leaves the first cell where it is, since nothing stands above it", () => {
        const session = storyOfThreeCells();
        new MoveCellUpCommand().invoke(session, { cellId: "c1" });
        expect(session.document.cells.map((cell) => cell.uniqueId)).toEqual([
            "c1",
            "c2",
            "c3",
        ]);
    });
});
