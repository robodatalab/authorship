import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { Cell } from "../storydoc/storydoc";
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
        const annotation = Cell.ofKind(cellKind);
        session.changeTheDocument((story) => story.cells.push(annotation));
        session.selectTheStoryAnnotation(cellKind, annotation.uniqueId);
    }
}
