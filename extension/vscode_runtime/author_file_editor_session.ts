import type * as vscode from "vscode";

import type { WebviewProseError } from "../webview/author_editor/AuthorFileEditorCanvas";
import { AuthorDocumentProseCheck } from "./prose/model";
import type { AuthorDocument } from "./storydoc/model";

const openSessions = new Map<string, AuthorFileEditorSession>();

/**
 * One open editor: the document, the page drawing it, and what the checks found.
 *
 * The check belongs here rather than to the document. What the prose was found
 * to be is this editor's reading of the file rather than part of it, and it goes
 * when the editor does.
 */
export class AuthorFileEditorSession {
    readonly proseCheck = new AuthorDocumentProseCheck();

    constructor(
        readonly document: AuthorDocument,
        private readonly panel: vscode.WebviewPanel,
    ) {
        this.proseCheck.onChanged(() => this.sendProseErrors());
    }

    sendDocument(): void {
        void this.panel.webview.postMessage({
            type: "document",
            cells: this.document.cells.map((cell) => ({
                kind: cell.kind,
                source: cell.source,
                attrs: cell.attrs,
            })),
        });
    }

    sendProseErrors(): void {
        void this.panel.webview.postMessage({
            type: "proseErrors",
            errors: this.proseErrorsToDraw(),
        });
    }

    /** An error in a cell the author has since deleted is about nothing. */
    private proseErrorsToDraw(): WebviewProseError[] {
        return this.proseCheck.errors.flatMap((error) => {
            const cell = this.document.cells.indexOf(error.cell);
            return cell < 0
                ? []
                : [
                      {
                          id: error.id,
                          cell,
                          at: error.at,
                          end: error.end,
                          message: error.message,
                          detail: error.detail,
                          replacements: error.replacements,
                      },
                  ];
        });
    }
}

export function openAuthorFileEditorSession(
    document: AuthorDocument,
    panel: vscode.WebviewPanel,
): AuthorFileEditorSession {
    const session = new AuthorFileEditorSession(document, panel);
    openSessions.set(document.uri.toString(), session);
    return session;
}

export function authorFileEditorSession(
    document: AuthorDocument,
): AuthorFileEditorSession | undefined {
    return openSessions.get(document.uri.toString());
}

export function closeAuthorFileEditorSession(document: AuthorDocument): void {
    openSessions.delete(document.uri.toString());
}
