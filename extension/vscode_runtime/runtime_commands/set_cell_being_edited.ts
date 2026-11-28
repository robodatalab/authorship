import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export const SET_CELL_BEING_EDITED = "editing";

export class SetCellBeingEditedCommand implements RuntimeCommand {
    constructor(private readonly cellId: string | null) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetCellBeingEditedCommand {
        const cellId = serialized.cellId as string | null;
        const command = new SetCellBeingEditedCommand(cellId);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.theAuthorIsEditingTheCell(this.cellId);
    }
}
