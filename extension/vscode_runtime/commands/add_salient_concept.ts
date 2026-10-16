import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { blankCellOfKind } from "../storydoc/cell_kinds";
import { SALIENT_CONCEPT } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AddSalientConceptCommand implements AuthorDocumentCommand {
    readonly commandName = "addSalientConcept";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(session: AuthorFileEditorSession): void {
        const concept = blankCellOfKind(SALIENT_CONCEPT);
        session.changeTheDocument((story) => story.insertBefore(null, concept));
        session.selectTheSalientConcept(concept.uniqueId);
    }
}
