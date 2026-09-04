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

/** A command as the page has it: what to draw, and the asking a click does. */
export interface WebviewAuthorDocumentCommandCard {
    readonly name: string;
    readonly category: string;
    readonly iconClassName: string;
    readonly tooltip: string;
    readonly invoke: () => void;
}
