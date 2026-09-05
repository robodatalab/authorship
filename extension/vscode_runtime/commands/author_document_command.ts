import type { AuthorDocument } from "../storydoc/model";

/**
 * One thing an author can do to a document, defined once and carried out here.
 *
 * The page draws the command from its card and asks for it by name; the document
 * is only ever touched on this side.
 */
export interface AuthorDocumentCommand {
    readonly name: string;
    readonly category: string;
    readonly iconClassName: string;
    readonly tooltip: string;
    invoke(document: AuthorDocument, payload: Record<string, unknown>): void;
}
