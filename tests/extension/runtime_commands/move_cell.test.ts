import { describe, expect, it } from "vitest";

import { MoveCellCommand } from "../../../extension/vscode_runtime/runtime_commands/move_cell";
import { openStory } from "./open_story";

const THE_STORY = `<!-- cell: chapter title="One" id="ch1" -->

<!-- cell: markdown id="m1" -->

She saw the door.

<!-- cell: chapter title="Two" id="ch2" -->

<!-- cell: markdown id="m2" -->

He heard the bell.

<!-- cell: plot title="The bell" id="p1" -->
`;

describe("MoveCellCommand — moves a cell to stand before another", () => {
    it.each([
        [
            "puts the cell before the one given",
            "m2",
            "m1",
            ["ch1", "m2", "m1", "ch2", "p1"],
        ],
        [
            "takes the cells a chapter holds with it",
            "ch2",
            "ch1",
            ["ch2", "m2", "ch1", "m1", "p1"],
        ],
        [
            "puts the cell at the end, given none to stand before",
            "m1",
            null,
            ["ch1", "ch2", "m2", "p1", "m1"],
        ],
        [
            "leaves a chapter where it is rather than within itself",
            "ch1",
            "m1",
            ["ch1", "m1", "ch2", "m2", "p1"],
        ],
    ])("%s", (_, cellId, beforeCellId, expected) => {
        const session = openStory(THE_STORY);

        MoveCellCommand.deserialize({ cellId, beforeCellId }).invoke(session);

        const cellIds = session.document.cells.map((cell) => cell.uniqueId);
        expect(cellIds).toEqual(expected);
    });
});
