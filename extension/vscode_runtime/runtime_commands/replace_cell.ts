import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { parse } from "authordoc/parser";
import type { RuntimeCommand } from "./runtime_command";

export const REPLACE_CELL = "replaceCell";

export class ReplaceCellCommand implements RuntimeCommand {
    constructor(private readonly cell: string) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): ReplaceCellCommand {
        const cell = serialized.cell as string;
        const command = new ReplaceCellCommand(cell);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        const [cellReplacing] = parse(this.cell);
        session.changeTheDocument((story) => {
            const storyChanged = story.withCell(cellReplacing);
            return storyChanged;
        });
    }
}
