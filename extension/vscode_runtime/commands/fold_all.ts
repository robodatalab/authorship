import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { FOLDED, type ImmutableAuthorDocument } from "../storydoc/model";
import type {
    AuthorDocumentCommand,
    CellAttributeCondition,
} from "./author_document_command";

export class FoldAllCommand implements AuthorDocumentCommand {
    readonly buttonGroup = "all_cells";
    readonly drawnWhenCellAttributeIs: CellAttributeCondition;

    constructor(
        readonly commandName: string,
        readonly iconClassName: string,
        readonly tooltip: string,
        private readonly folded: boolean,
    ) {
        this.drawnWhenCellAttributeIs = {
            attributeName: FOLDED,
            attributeValue: folded ? "" : "true",
        };
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            for (const cell of story.cells) {
                cell.fold(this.folded);
            }
        });
    }
}
