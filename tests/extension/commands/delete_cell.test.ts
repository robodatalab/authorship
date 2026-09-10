import { beforeEach, describe, expect, it } from "vitest";

import { DeleteCellCommand } from "../../../extension/vscode_runtime/commands/delete_cell";
import type { AuthorFileEditorSession } from "../../../extension/vscode_runtime/author_file_editor_session";
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

function cellIds(session: AuthorFileEditorSession): string[] {
    return session.document.cells.map((cell) => cell.uniqueId);
}

beforeEach(forgetWhatTheEditorDid);

describe("DeleteCellCommand — deletes a cell", () => {
    it("takes out the cell it is given and leaves the rest where they were", async () => {
        const session = storyOfThreeCells();
        await new DeleteCellCommand().invoke(session, { cellId: "c2" });
        expect(cellIds(session)).toEqual(["c1", "c3"]);
    });

    it("leaves the document alone when there is no cell at that index", async () => {
        const session = storyOfThreeCells();
        await new DeleteCellCommand().invoke(session, { cellId: "nowhere" });
        expect(cellIds(session)).toEqual(["c1", "c2", "c3"]);
    });

    it("asks nothing about a section holding nothing", async () => {
        const session = openStory(A_STORY_IN_A_PART);

        await new DeleteCellCommand().invoke(session, { cellId: "c2" });

        expect(shownMessages).toEqual([]);
        expect(cellIds(session)).toEqual(["p1", "c1", "m1"]);
    });
});

describe("DeleteCellCommand — deletes a section that holds other cells", () => {
    it("asks the author what is to go with it", async () => {
        const session = openStory(A_STORY_IN_A_PART);

        await new DeleteCellCommand().invoke(session, { cellId: "c1" });

        expect(shownMessages[0]).toBe(
            "Delete “The Door” and the 1 section under it?",
        );
    });

    it("counts everything under it, however deep it stands", async () => {
        const session = openStory(A_STORY_IN_A_PART);

        await new DeleteCellCommand().invoke(session, { cellId: "p1" });

        expect(shownMessages[0]).toBe(
            "Delete “Book One” and the 3 sections under it?",
        );
    });

    it("takes the whole section when that is what the author asked for", async () => {
        const session = openStory(A_STORY_IN_A_PART);
        dialogs.answerToTheWarning = "Delete All";

        await new DeleteCellCommand().invoke(session, { cellId: "c1" });

        expect(cellIds(session)).toEqual(["p1", "c2"]);
    });

    it("takes the cell alone and leaves what it held where it stands", async () => {
        const session = openStory(A_STORY_IN_A_PART);
        dialogs.answerToTheWarning = "Only This One";

        await new DeleteCellCommand().invoke(session, { cellId: "c1" });

        expect(cellIds(session)).toEqual(["p1", "m1", "c2"]);
    });

    it("deletes nothing when the author answers neither", async () => {
        const session = openStory(A_STORY_IN_A_PART);

        await new DeleteCellCommand().invoke(session, { cellId: "p1" });

        expect(cellIds(session)).toEqual(["p1", "c1", "m1", "c2"]);
    });
});
