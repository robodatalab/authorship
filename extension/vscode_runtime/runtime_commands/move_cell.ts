import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    cellsBySection,
    cellsWithinASection,
    whereACellStands,
} from "authordoc/story_sections";
import type { Document } from "authordoc/storydoc";
import type { RuntimeCommand } from "./runtime_command";

export function moveTheSection(
    story: Document,
    cellId: string,
    beforeCellId: string | null,
): Document {
    const sections = cellsBySection(story.cells);
    const standing = whereACellStands(sections, cellId);
    if (!standing) {
        return story;
    }
    const cellsHeld = cellsWithinASection(standing.section);
    const idsHeld = cellsHeld.map((held) => held.uniqueId);
    if (beforeCellId !== null && idsHeld.includes(beforeCellId)) {
        return story;
    }
    const cellsLeft = story.cells.filter(
        (cell) => !idsHeld.includes(cell.uniqueId),
    );
    const lands =
        beforeCellId === null
            ? cellsLeft.length
            : cellsLeft.findIndex((cell) => cell.uniqueId === beforeCellId);
    if (lands === -1) {
        return story;
    }
    const cellsBefore = cellsLeft.slice(0, lands);
    const cellsAfter = cellsLeft.slice(lands);
    const cells = [...cellsBefore, ...cellsHeld, ...cellsAfter];
    const storyChanged = story.withCells(cells);
    return storyChanged;
}

export const MOVE_CELL = "moveCell";

export class MoveCellCommand implements RuntimeCommand {
    constructor(
        private readonly cellId: string,
        private readonly beforeCellId: string | null,
    ) {}

    static deserialize(serialized: Record<string, unknown>): MoveCellCommand {
        const cellId = serialized.cellId as string;
        const beforeCellId = serialized.beforeCellId as string | null;
        const command = new MoveCellCommand(cellId, beforeCellId);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) =>
            moveTheSection(story, this.cellId, this.beforeCellId),
        );
    }
}
