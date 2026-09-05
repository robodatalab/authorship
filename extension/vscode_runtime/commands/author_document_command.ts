import type { AuthorDocument } from "../storydoc/model";

/**
 * When a command is drawn: only beside a cell whose attribute reads this way.
 *
 * An attribute a cell does not carry reads as the empty string, so a command
 * that undoes something is drawn only where it was done.
 */
export interface AuthorDocumentCommandVisibility {
    readonly attribute: string;
    readonly value: string;
}

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
    readonly visibleWhen?: AuthorDocumentCommandVisibility;
    invoke(document: AuthorDocument, payload: Record<string, unknown>): void;
}
