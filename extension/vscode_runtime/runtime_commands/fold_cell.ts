import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export const FOLD_CELL = "foldCell";
export const UNFOLD_CELL = "unfoldCell";

export class FoldCellCommand implements RuntimeCommand {
    constructor(
        private readonly cellId: string,
        private readonly folded: boolean,
    ) {}

    static deserializeFoldCell(
        serialized: Record<string, unknown>,
    ): FoldCellCommand {
        const cellId = serialized.cellId as string;
        const command = new FoldCellCommand(cellId, true);
        return command;
    }

    static deserializeUnfoldCell(
        serialized: Record<string, unknown>,
    ): FoldCellCommand {
        const cellId = serialized.cellId as string;
        const command = new FoldCellCommand(cellId, false);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const cell = story.cellWithId(this.cellId);
            if (!cell) {
                return story;
            }
            const cellRewritten = cell.withFolded(this.folded);
            const storyChanged = story.withCell(cellRewritten);
            return storyChanged;
        });
    }
}
