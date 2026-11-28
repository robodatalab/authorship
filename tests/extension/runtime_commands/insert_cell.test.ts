import { describe, expect, it } from "vitest";

import { InsertCellCommand } from "../../../extension/vscode_runtime/runtime_commands/insert_cell";
import { storyOfThreeCells } from "./open_story";

describe("InsertCellCommand — inserts a cell", () => {
    it("puts the new cell before the one it was asked to precede", () => {
        const session = storyOfThreeCells();

        InsertCellCommand.deserialize({
            beforeCellId: "c2",
            cellKind: "note",
        }).invoke(session);

        expect(session.document.cells.map((cell) => cell.kind)).toEqual([
            "chapter",
            "note",
            "markdown",
            "markdown",
        ]);
    });

    it("starts it as a blank of its kind", () => {
        const session = storyOfThreeCells();

        InsertCellCommand.deserialize({
            beforeCellId: "c2",
            cellKind: "chapter",
        }).invoke(session);

        expect(session.document.cells[1]).toMatchObject({
            kind: "chapter",
            title: "",
            source: "",
        });
    });

    it("starts a salient concept untitled", () => {
        const session = storyOfThreeCells();

        InsertCellCommand.deserialize({
            beforeCellId: "c2",
            cellKind: "salient-concept",
        }).invoke(session);

        expect(session.document.cells[1]).toMatchObject({
            kind: "salient-concept",
            title: "",
            references: [],
        });
    });

    it("puts it at the end when it precedes no cell at all", () => {
        const session = storyOfThreeCells();

        InsertCellCommand.deserialize({
            beforeCellId: null,
            cellKind: "note",
        }).invoke(session);

        expect(session.document.cells[3].kind).toBe("note");
    });

    it("puts it at the top when it precedes the first cell", () => {
        const session = storyOfThreeCells();

        InsertCellCommand.deserialize({
            beforeCellId: "c1",
            cellKind: "note",
        }).invoke(session);

        expect(session.document.cells[0].kind).toBe("note");
    });

    it("puts it at the end when it precedes a cell the document has not got", () => {
        const session = storyOfThreeCells();

        InsertCellCommand.deserialize({
            beforeCellId: "nowhere",
            cellKind: "note",
        }).invoke(session);

        expect(session.document.cells[3].kind).toBe("note");
    });
});
