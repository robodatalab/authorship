import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { FOLDED, type ImmutableAuthorDocument } from "../storydoc/model";
import type {
    AuthorDocumentCommand,
    CellAttributeCondition,
} from "./author_document_command";

export class FoldCellCommand implements AuthorDocumentCommand {
    readonly buttonGroup = "cell";
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

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) =>
            story
                .cellWithId(commandArguments.cellId as string)
                ?.fold(this.folded),
        );
    }
}
