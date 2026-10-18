import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { blankCellOfKind } from "../storydoc/cell_kinds";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AddStoryAnnotationCommand implements AuthorDocumentCommand {
    readonly commandName = "addStoryAnnotation";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const cellKind = commandArguments.cellKind as string;
        const annotation = blankCellOfKind(cellKind);
        session.changeTheDocument((story) =>
            story.insertBefore(null, annotation),
        );
        session.selectTheStoryAnnotation(cellKind, annotation.uniqueId);
    }
}
