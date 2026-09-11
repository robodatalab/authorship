import * as vscode from "vscode";

import type { ProseCheckError } from "./commands/check_prose";
import type {
    AuthorFileEditorMessage,
    MessageQueueListener,
} from "./message_queue_between_vscode_and_webview";
import { AuthorDocSynchronizer } from "./storydoc/author_doc_synch";
import {
    ImmutableAuthorDocument,
    MutableAuthorDocument,
} from "./storydoc/model";
import { WordCounter } from "./storydoc/word_counter";

export class AuthorFileEditorSession
    implements vscode.CustomDocument, MessageQueueListener
{
    private readonly proseErrors: ProseCheckError[] = [];
    private readonly howFarEachCellHasBeenWritten = new Map<string, number>();
    private readonly synchronizer: AuthorDocSynchronizer<ProseCheckError>;
    private readonly wordCounter = new WordCounter();
    private documentAsTheLastSynchronizationLeftIt: ImmutableAuthorDocument;

    private panel: vscode.WebviewPanel | undefined;

    private cellTheAuthorIsEditing: string | null = null;

    constructor(private documentAsItStands: ImmutableAuthorDocument) {
        this.synchronizer = new AuthorDocSynchronizer(this.proseErrors);
        this.documentAsTheLastSynchronizationLeftIt = this.documentAsItStands;
        this.wordCounter.synchronize(this.documentAsItStands);
    }

    get uri(): vscode.Uri {
        return this.documentAsItStands.uri;
    }

    dispose(): void {}

    showOn(panel: vscode.WebviewPanel): void {
        this.panel = panel;
    }

    async onMessage(message: AuthorFileEditorMessage): Promise<void> {
        await message.invoke(this);
        this.sendDocument();
    }

    get document(): ImmutableAuthorDocument {
        return this.documentAsItStands;
    }

    theAuthorIsEditingTheCell(cellId: string | null): void {
        this.cellTheAuthorIsEditing = cellId;
    }

    importTheFileLeavingTheCellTheAuthorIsEditing(savedText: string): void {
        const beingEdited = this.cellTheAuthorIsEditing;
        const asTheAuthorHasIt = beingEdited
            ? this.documentAsItStands.cellWithId(beingEdited)?.source
            : undefined;
        this.changeTheDocument((document) => {
            document.fromText(savedText);
            if (beingEdited && asTheAuthorHasIt !== undefined) {
                document
                    .cellWithId(beingEdited)
                    ?.replaceMarkdown(asTheAuthorHasIt);
            }
        });
    }

    importDocumentFromText(text: string): void {
        this.documentAsItStands = new ImmutableAuthorDocument(this.uri, text);
        this.synchronizeTheRepresentations();
    }

    changeTheDocument(change: (document: MutableAuthorDocument) => void): void {
        const documentBeingChanged = new MutableAuthorDocument(
            this.uri,
            this.documentAsItStands.text,
        );
        change(documentBeingChanged);
        this.documentAsItStands = documentBeingChanged.toImmutable();
        this.synchronizeTheRepresentations();
    }

    async writeTheDocumentToItsFile(): Promise<void> {
        await this.writeTheDocumentTo(this.uri);
    }

    async writeTheDocumentTo(destination: vscode.Uri): Promise<void> {
        await vscode.workspace.fs.writeFile(
            destination,
            new TextEncoder().encode(this.documentAsItStands.text),
        );
    }

    async readTheDocumentBackFromItsFile(): Promise<void> {
        const bytes = await vscode.workspace.fs.readFile(this.uri);
        this.importDocumentFromText(new TextDecoder().decode(bytes));
    }

    showProseErrors(proseErrors: ProseCheckError[]): void {
        this.proseErrors.splice(0, this.proseErrors.length, ...proseErrors);
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

    private synchronizeTheRepresentations(): void {
        this.synchronizer.synchronize(
            this.documentAsTheLastSynchronizationLeftIt,
            this.documentAsItStands,
        );
        this.documentAsTheLastSynchronizationLeftIt = this.documentAsItStands;
        this.wordCounter.synchronize(this.documentAsItStands);
    }

    sendCellsBeingWritten(): void {
        void this.panel?.webview.postMessage({
            type: "cellsBeingWritten",
            cellsBeingWritten: Object.fromEntries(
                this.howFarEachCellHasBeenWritten,
            ),
        });
    }

    sendWordCounts(): void {
        void this.panel?.webview.postMessage({
            type: "wordCounts",
            wordsInEverySection: this.wordCounter.wordsInEverySection,
            wordsInTheDocument: this.wordCounter.wordsInTheDocument,
        });
    }

    sendProseErrors(): void {
        void this.panel?.webview.postMessage({
            type: "proseErrors",
            proseErrors: [...this.proseErrors],
        });
    }

    sendDocument(): void {
        this.synchronizeTheRepresentations();
        void this.panel?.webview.postMessage({
            type: "document",
            cells: this.documentAsItStands.cells.map((cell) => ({
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
    uri: vscode.Uri,
    text: string,
): AuthorFileEditorSession {
    return new AuthorFileEditorSession(
        new ImmutableAuthorDocument(uri, text),
    );
}
