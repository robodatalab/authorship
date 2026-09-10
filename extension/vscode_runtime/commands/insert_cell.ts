import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { blankCellOfKind } from "../storydoc/cell_kinds";
import type { ImmutableAuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class InsertCellCommand implements AuthorDocumentCommand {
    readonly commandName = "insertCell";
    readonly buttonGroup = "insert";
    readonly iconClassName = "codicon codicon-add";
    readonly tooltip = "Add a section here";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) =>
            story.insertBefore(
                (commandArguments.beforeCellId as string | null) ?? null,
                blankCellOfKind(commandArguments.cellKind as string),
            ),
        );
    }
}
