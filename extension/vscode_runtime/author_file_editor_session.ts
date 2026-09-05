import type * as vscode from "vscode";

import type { AuthorDocument } from "./storydoc/model";

const openSessions = new Map<string, AuthorFileEditorSession>();

export class AuthorFileEditorSession {
    constructor(
        readonly document: AuthorDocument,
        private readonly panel: vscode.WebviewPanel,
    ) {}

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
