import { describe, expect, it } from "vitest";

import { FoldCellCommand } from "../../../extension/vscode_runtime/commands/fold_cell";
import { storyOfThreeCells } from "./open_story";

describe("FoldCellCommand — folds a cell", () => {
    it("folds the cell it is given, and unfolds it when that is what it was registered to do", () => {
        const session = storyOfThreeCells();
        new FoldCellCommand("foldCell", "", "", true).invoke(session, {
            cellId: "c2",
        });
        expect(session.document.cells[1].isFolded()).toBe(true);

        new FoldCellCommand("unfoldCell", "", "", false).invoke(session, {
            cellId: "c2",
        });
        expect(session.document.cells[1].isFolded()).toBe(false);
    });

    it("leaves the document alone when there is no cell at that index", () => {
        const session = storyOfThreeCells();
        new FoldCellCommand("foldCell", "", "", true).invoke(session, {
            cellId: "nowhere",
        });
        expect(session.document.text).not.toContain("folded");
    });
});
