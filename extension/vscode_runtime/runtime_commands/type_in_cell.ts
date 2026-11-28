import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export const TYPE_IN_CELL = "typed";

export class TypeInCellCommand implements RuntimeCommand {
    constructor(
        private readonly cellId: string,
        private readonly markdown: string,
    ) {}

    static deserialize(serialized: Record<string, unknown>): TypeInCellCommand {
        const cellId = serialized.cellId as string;
        const markdown = serialized.markdown as string;
        const command = new TypeInCellCommand(cellId, markdown);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.theAuthorTypedInTheCell(this.cellId, this.markdown);
    }
}
