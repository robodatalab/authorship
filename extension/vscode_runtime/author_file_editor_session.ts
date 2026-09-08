import type * as vscode from "vscode";

import type { ProseCheckError } from "./commands/check_prose";
import { AuthorDocSynchronizer } from "./storydoc/author_doc_synch";
import { AuthorDocument } from "./storydoc/model";
import { WordCounter } from "./storydoc/word_counter";

const openSessions = new Map<string, AuthorFileEditorSession>();

export class AuthorFileEditorSession {
    private readonly proseErrors: ProseCheckError[] = [];
    private readonly howFarEachCellHasBeenWritten = new Map<string, number>();
    private readonly synchronizer: AuthorDocSynchronizer<ProseCheckError>;
    private readonly wordCounter = new WordCounter();
    private documentAsTheLastSynchronizationLeftIt: AuthorDocument;

    constructor(
        readonly document: AuthorDocument,
        private readonly panel: vscode.WebviewPanel,
    ) {
        this.synchronizer = new AuthorDocSynchronizer(this.proseErrors);
        this.documentAsTheLastSynchronizationLeftIt = AuthorDocument.fromText(
            document.text,
        );
        this.wordCounter.synchronize(document);
    }

    showProseErrors(proseErrors: ProseCheckError[]): void {
        this.proseErrors.splice(0, this.proseErrors.length, ...proseErrors);
        this.documentAsTheLastSynchronizationLeftIt = AuthorDocument.fromText(
            this.document.text,
        );
        this.sendProseErrors();
    }

    writingCell(cellId: string, howFarAlong: number): void {
        this.howFarEachCellHasBeenWritten.set(cellId, howFarAlong);
        this.sendCellsBeingWritten();
    }

    stopWritingCell(cellId: string): void {
        this.howFarEachCellHasBeenWritten.delete(cellId);
        this.sendCellsBeingWritten();
    }

    sendCellsBeingWritten(): void {
        void this.panel.webview.postMessage({
            type: "cellsBeingWritten",
            cellsBeingWritten: Object.fromEntries(
                this.howFarEachCellHasBeenWritten,
            ),
        });
    }

    sendWordCounts(): void {
        void this.panel.webview.postMessage({
            type: "wordCounts",
            wordsInEverySection: this.wordCounter.wordsInEverySection,
            wordsInTheDocument: this.wordCounter.wordsInTheDocument,
        });
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
        this.wordCounter.synchronize(this.document);
        void this.panel.webview.postMessage({
            type: "document",
            cells: this.document.cells.map((cell) => ({
                kind: cell.kind,
                source: cell.source,
                attrs: cell.attrs,
            })),
        });
        this.sendProseErrors();
        this.sendWordCounts();
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
