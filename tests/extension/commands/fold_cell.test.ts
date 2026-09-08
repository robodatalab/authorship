import { describe, expect, it } from "vitest";

import { FoldCellCommand } from "../../../extension/vscode_runtime/commands/fold_cell";
import { storyOfThreeCells } from "./open_story";

describe("FoldCellCommand — folds a cell", () => {
    it("folds the cell it is given, and unfolds it when that is what it was registered to do", () => {
        const document = storyOfThreeCells();
        new FoldCellCommand("foldCell", "", "", true).invoke(document, {
            cellId: "c2",
        });
        expect(document.cells[1].isFolded()).toBe(true);

        new FoldCellCommand("unfoldCell", "", "", false).invoke(document, {
            cellId: "c2",
        });
        expect(document.cells[1].isFolded()).toBe(false);
    });

    it("leaves the document alone when there is no cell at that index", () => {
        const document = storyOfThreeCells();
        new FoldCellCommand("foldCell", "", "", true).invoke(document, {
            cellId: "nowhere",
        });
        expect(document.text).not.toContain("folded");
    });
});
