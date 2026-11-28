import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";
import { cellOfKind } from "authordoc/parser";

export const INSERT_CELL = "insertCell";

export class InsertCellCommand implements RuntimeCommand {
    constructor(
        private readonly beforeCellId: string | null,
        private readonly cellKind: string,
    ) {}

    static deserialize(serialized: Record<string, unknown>): InsertCellCommand {
        const beforeCellId = serialized.beforeCellId as string | null;
        const cellKind = serialized.cellKind as string;
        const command = new InsertCellCommand(beforeCellId, cellKind);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        const blankCell = cellOfKind(this.cellKind);
        session.changeTheDocument((story) => {
            const cells = [...story.cells];
            const beforeCellIndex = cells.findIndex(
                (cell) => cell.uniqueId === this.beforeCellId,
            );
            const insertedAt =
                beforeCellIndex === -1 ? cells.length : beforeCellIndex;
            cells.splice(insertedAt, 0, blankCell);
            const storyWithTheCell = story.withCells(cells);
            return storyWithTheCell;
        });
    }
}
