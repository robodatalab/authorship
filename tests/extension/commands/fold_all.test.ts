import { describe, expect, it } from "vitest";

import { FoldAllCommand } from "../../../extension/vscode_runtime/commands/fold_all";
import { openStory, storyOfThreeCells } from "./open_story";

const FOLD_ALL = new FoldAllCommand(
    "foldAll",
    "codicon codicon-collapse-all",
    "Fold every section away",
    true,
);
const UNFOLD_ALL = new FoldAllCommand(
    "unfoldAll",
    "codicon codicon-expand-all",
    "Unfold every section",
    false,
);

describe("FoldAllCommand — folds and unfolds the whole document", () => {
    it("folds every cell away", () => {
        const document = storyOfThreeCells();

        FOLD_ALL.invoke(document);

        expect(document.cells.map((cell) => cell.isFolded())).toEqual([
            true,
            true,
            true,
        ]);
    });

    it("unfolds every cell, the prose included", () => {
        const document = openStory(
            '<!-- cell: chapter title="One" id="c1" folded="true" -->\n\n<!-- cell: markdown id="c2" folded="true" -->\n\nShe saw the door.\n',
        );

        UNFOLD_ALL.invoke(document);

        expect(document.cells.map((cell) => cell.isFolded())).toEqual([
            false,
            false,
        ]);
    });

    it("leaves the prose alone", () => {
        const document = storyOfThreeCells();

        FOLD_ALL.invoke(document);

        expect(document.cellWithId("c2")?.source).toBe("She saw the door.");
    });

    it("does nothing to a document with no cells at all", () => {
        const document = openStory("");

        FOLD_ALL.invoke(document);

        expect(document.cells).toEqual([]);
    });
});

describe("FoldAllCommand — which of the two is drawn", () => {
    it("offers to fold a cell that is not folded", () => {
        expect(FOLD_ALL.drawnWhenCellAttributeIs).toEqual({
            attributeName: "folded",
            attributeValue: "",
        });
    });

    it("offers to unfold a cell that is folded", () => {
        expect(UNFOLD_ALL.drawnWhenCellAttributeIs).toEqual({
            attributeName: "folded",
            attributeValue: "true",
        });
    });
});
