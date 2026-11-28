import { describe, expect, it } from "vitest";

import { FoldCellCommand } from "../../../extension/vscode_runtime/runtime_commands/fold_cell";
import { storyOfThreeCells } from "./open_story";

describe("FoldCellCommand — folds a cell", () => {
    it("folds the cell it is given, and unfolds it when that is what it was registered to do", () => {
        const session = storyOfThreeCells();
        FoldCellCommand.deserializeFoldCell({
            cellId: "c2",
        }).invoke(session);
        expect(session.document.cells[1].folded).toBe(true);

        FoldCellCommand.deserializeUnfoldCell({
            cellId: "c2",
        }).invoke(session);
        expect(session.document.cells[1].folded).toBe(false);
    });

    it("leaves the document alone when there is no cell at that index", () => {
        const session = storyOfThreeCells();
        FoldCellCommand.deserializeFoldCell({
            cellId: "nowhere",
        }).invoke(session);
        expect(session.document.text).not.toContain("folded");
    });
});
