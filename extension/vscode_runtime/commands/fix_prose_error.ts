import { authorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class FixProseErrorCommand implements AuthorDocumentCommand {
    readonly name = "fixProseError";
    readonly category = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    /**
     * Write what the check said belongs there instead.
     *
     * Only a fault that came with an answer can be put right here: what a
     * sentence should have said instead is the author's to write, and a check
     * that has no replacement to offer is telling them something rather than
     * asking them to press a button.
     *
     * The error is taken away rather than left to be worked out from the text,
     * because an answer written at the end of the marked words touches none of
     * them — a full stop after "scenes" would leave the mark exactly where it was.
     */
    invoke(document: AuthorDocument, payload: Record<string, unknown>): void {
        const check = authorFileEditorSession(document)?.proseCheck;
        const error = check?.errors.find(
            (found) => found.id === (payload.id as number),
        );
        if (!check || !error || error.replacements.length === 0) {
            return;
        }
        const source = error.cell.source;
        error.cell.replaceMarkdown(
            source.slice(0, error.at) +
                error.replacements[0] +
                source.slice(error.end),
        );
        check.remove(error.id);
    }
}
