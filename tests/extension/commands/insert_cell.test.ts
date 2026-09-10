import { describe, expect, it } from "vitest";

import { InsertCellCommand } from "../../../extension/vscode_runtime/commands/insert_cell";
import { storyOfThreeCells } from "./open_story";

describe("InsertCellCommand — inserts a cell", () => {
    it("puts the new cell before the one it was asked to precede", () => {
        const session = storyOfThreeCells();

        new InsertCellCommand().invoke(session, {
            beforeCellId: "c2",
            cellKind: "note",
        });

        expect(session.document.cells.map((cell) => cell.kind)).toEqual([
            "chapter",
            "note",
            "markdown",
            "markdown",
        ]);
    });

    it("starts it as a blank of its kind", () => {
        const session = storyOfThreeCells();

        new InsertCellCommand().invoke(session, {
            beforeCellId: "c2",
            cellKind: "chapter",
        });

        expect(session.document.cells[1].attrs.title).toBe("Untitled");
    });

    it("puts it at the end when it precedes no cell at all", () => {
        const session = storyOfThreeCells();

        new InsertCellCommand().invoke(session, {
            beforeCellId: null,
            cellKind: "note",
        });

        expect(session.document.cells[3].kind).toBe("note");
    });

    it("puts it at the top when it precedes the first cell", () => {
        const session = storyOfThreeCells();

        new InsertCellCommand().invoke(session, {
            beforeCellId: "c1",
            cellKind: "note",
        });

        expect(session.document.cells[0].kind).toBe("note");
    });

    it("puts it at the end when it precedes a cell the document has not got", () => {
        const session = storyOfThreeCells();

        new InsertCellCommand().invoke(session, {
            beforeCellId: "nowhere",
            cellKind: "note",
        });

        expect(session.document.cells[3].kind).toBe("note");
    });
});
