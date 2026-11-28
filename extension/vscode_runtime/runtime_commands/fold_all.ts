import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export const FOLD_ALL = "foldAll";
export const UNFOLD_ALL = "unfoldAll";

export class FoldAllCommand implements RuntimeCommand {
    constructor(private readonly folded: boolean) {}

    static deserializeFoldAll(): FoldAllCommand {
        const command = new FoldAllCommand(true);
        return command;
    }

    static deserializeUnfoldAll(): FoldAllCommand {
        const command = new FoldAllCommand(false);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const cellsFolded = story.cells.map((cell) =>
                cell.withFolded(this.folded),
            );
            const storyFolded = story.withCells(cellsFolded);
            return storyFolded;
        });
    }
}
