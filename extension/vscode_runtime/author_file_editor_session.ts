import type * as vscode from "vscode";

import type { ProseCheckError } from "./commands/check_prose";
import { AuthorDocSynchronizer } from "./storydoc/author_doc_synch";
import { AuthorDocument } from "./storydoc/model";

const openSessions = new Map<string, AuthorFileEditorSession>();

export class AuthorFileEditorSession {
    private readonly proseErrors: ProseCheckError[] = [];
    private readonly synchronizer: AuthorDocSynchronizer<ProseCheckError>;
    private documentAsTheLastSynchronizationLeftIt: AuthorDocument;

    constructor(
        readonly document: AuthorDocument,
        private readonly panel: vscode.WebviewPanel,
    ) {
        this.synchronizer = new AuthorDocSynchronizer(this.proseErrors);
        this.documentAsTheLastSynchronizationLeftIt = AuthorDocument.fromText(
            document.text,
        );
    }

    showProseErrors(proseErrors: ProseCheckError[]): void {
        this.proseErrors.splice(0, this.proseErrors.length, ...proseErrors);
        this.documentAsTheLastSynchronizationLeftIt = AuthorDocument.fromText(
            this.document.text,
        );
        this.sendProseErrors();
    }

    sendProseErrors(): void {
        void this.panel.webview.postMessage({
            type: "proseErrors",
            proseErrors: [...this.proseErrors],
        });
    }

    sendDocument(): void {
        this.synchronizer.synchronize(
            this.documentAsTheLastSynchronizationLeftIt,
            this.document,
        );
        this.documentAsTheLastSynchronizationLeftIt = AuthorDocument.fromText(
            this.document.text,
        );
        void this.panel.webview.postMessage({
            type: "document",
            cells: this.document.cells.map((cell) => ({
                kind: cell.kind,
                source: cell.source,
                attrs: cell.attrs,
            })),
        });
        this.sendProseErrors();
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
