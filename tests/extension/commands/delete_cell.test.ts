import { beforeEach, describe, expect, it } from "vitest";

import { DeleteCellCommand } from "../../../extension/vscode_runtime/commands/delete_cell";
import type { AuthorDocument } from "../../../extension/vscode_runtime/storydoc/model";
import { dialogs, shownMessages } from "../vscode";
import {
    forgetWhatTheEditorDid,
    openStory,
    storyOfThreeCells,
} from "./open_story";

const A_STORY_IN_A_PART = `
<!-- cell: part title="Book One" id="p1" -->

<!-- cell: chapter title="The Door" id="c1" -->

<!-- cell: markdown id="m1" -->

She saw the door.

<!-- cell: chapter title="The Bell" id="c2" -->
`;

function cellIds(document: AuthorDocument): string[] {
    return document.cells.map((cell) => cell.uniqueId);
}

beforeEach(forgetWhatTheEditorDid);

describe("DeleteCellCommand — deletes a cell", () => {
    it("takes out the cell it is given and leaves the rest where they were", async () => {
        const document = storyOfThreeCells();
        await new DeleteCellCommand().invoke(document, { cellId: "c2" });
        expect(cellIds(document)).toEqual(["c1", "c3"]);
    });

    it("leaves the document alone when there is no cell at that index", async () => {
        const document = storyOfThreeCells();
        await new DeleteCellCommand().invoke(document, { cellId: "nowhere" });
        expect(cellIds(document)).toEqual(["c1", "c2", "c3"]);
    });

    it("asks nothing about a section holding nothing", async () => {
        const document = openStory(A_STORY_IN_A_PART);

        await new DeleteCellCommand().invoke(document, { cellId: "c2" });

        expect(shownMessages).toEqual([]);
        expect(cellIds(document)).toEqual(["p1", "c1", "m1"]);
    });
});

describe("DeleteCellCommand — deletes a section that holds other cells", () => {
    it("asks the author what is to go with it", async () => {
        const document = openStory(A_STORY_IN_A_PART);

        await new DeleteCellCommand().invoke(document, { cellId: "c1" });

        expect(shownMessages[0]).toBe(
            "Delete “The Door” and the 1 section under it?",
        );
    });

    it("counts everything under it, however deep it stands", async () => {
        const document = openStory(A_STORY_IN_A_PART);

        await new DeleteCellCommand().invoke(document, { cellId: "p1" });

        expect(shownMessages[0]).toBe(
            "Delete “Book One” and the 3 sections under it?",
        );
    });

    it("takes the whole section when that is what the author asked for", async () => {
        const document = openStory(A_STORY_IN_A_PART);
        dialogs.answerToTheWarning = "Delete All";

        await new DeleteCellCommand().invoke(document, { cellId: "c1" });

        expect(cellIds(document)).toEqual(["p1", "c2"]);
    });

    it("takes the cell alone and leaves what it held where it stands", async () => {
        const document = openStory(A_STORY_IN_A_PART);
        dialogs.answerToTheWarning = "Only This One";

        await new DeleteCellCommand().invoke(document, { cellId: "c1" });

        expect(cellIds(document)).toEqual(["p1", "m1", "c2"]);
    });

    it("deletes nothing when the author answers neither", async () => {
        const document = openStory(A_STORY_IN_A_PART);

        await new DeleteCellCommand().invoke(document, { cellId: "p1" });

        expect(cellIds(document)).toEqual(["p1", "c1", "m1", "c2"]);
    });
});
