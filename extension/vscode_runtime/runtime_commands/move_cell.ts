import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    cellsBySection,
    cellsWithinASection,
    whereACellStands,
} from "authordoc/story_sections";
import type { Document } from "authordoc/storydoc";
import type { AuthorDocumentCommand } from "./author_document_command";

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

export class MoveCellCommand implements AuthorDocumentCommand {
    readonly commandName = "moveCell";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const cellId = commandArguments.cellId as string;
        const beforeCellId = commandArguments.beforeCellId as string | null;
        session.changeTheDocument((story) =>
            moveTheSection(story, cellId, beforeCellId),
        );
    }
}
