import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";

export class FoldAllCommand implements AuthorDocumentCommand {
    readonly buttonGroup = "all_cells";
    readonly drawnWhenTheCellIsFolded: boolean;

    constructor(
        readonly commandName: string,
        readonly iconClassName: string,
        readonly tooltip: string,
        private readonly folded: boolean,
    ) {
        this.drawnWhenTheCellIsFolded = !folded;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            story.cells = story.cells.map((cell) =>
                cell.withFolded(this.folded),
            );
        });
    }
}
