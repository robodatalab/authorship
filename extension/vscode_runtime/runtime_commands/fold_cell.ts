import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";

export class FoldCellCommand implements AuthorDocumentCommand {
    readonly buttonGroup = "cell";
    readonly drawnWhenTheCellIsFolded: boolean;

    constructor(
        readonly commandName: string,
        readonly iconClassName: string,
        readonly tooltip: string,
        private readonly folded: boolean,
    ) {
        this.drawnWhenTheCellIsFolded = !folded;
    }

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const cellId = commandArguments.cellId as string;
        session.changeTheDocument((story) => {
            const cell = story.cellWithId(cellId);
            if (!cell) {
                return story;
            }
            const cellRewritten = cell.withFolded(this.folded);
            const storyChanged = story.withCell(cellRewritten);
            return storyChanged;
        });
    }
}
