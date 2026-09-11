import * as vscode from "vscode";

import type { ProseCheckError } from "./commands/check_prose";
import type {
    AuthorFileEditorMessage,
    MessageQueueListener,
} from "./message_queue_between_vscode_and_webview";
import { AuthorDocSynchronizer } from "./storydoc/author_doc_synch";
import { AuthorDocDiff } from "./storydoc/diff";
import {
    ImmutableAuthorDocument,
    MutableAuthorDocument,
    type ImmutableCell,
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

    private whatThePageJustTyped: { cellId: string; markdown: string } | null =
        null;

    constructor(
        private documentAsItStands: ImmutableAuthorDocument,
        private readonly edited: vscode.EventEmitter<
            vscode.CustomDocumentEditEvent<AuthorFileEditorSession>
        >,
    ) {
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
    }

    get document(): ImmutableAuthorDocument {
        return this.documentAsItStands;
    }

    theAuthorTypedInTheCell(cellId: string, markdown: string): void {
        this.whatThePageJustTyped = { cellId, markdown };
        this.changeTheDocument((story) =>
            story.cellWithId(cellId)?.replaceMarkdown(markdown),
        );
    }

    theAuthorIsEditingTheCell(cellId: string | null): void {
        this.cellTheAuthorIsEditing = cellId;
    }

    importTheFileLeavingTheCellTheAuthorIsEditing(savedText: string): void {
        const beingEdited = this.cellTheAuthorIsEditing;
        const asTheAuthorHasIt = beingEdited
            ? this.documentAsItStands.cellWithId(beingEdited)?.source
            : undefined;
        const asItStoodBefore = this.documentAsItStands;
        const documentAsTheFileHasIt = new MutableAuthorDocument(
            this.uri,
            savedText,
        );
        if (beingEdited && asTheAuthorHasIt !== undefined) {
            documentAsTheFileHasIt
                .cellWithId(beingEdited)
                ?.replaceMarkdown(asTheAuthorHasIt);
        }
        this.documentAsItStands = documentAsTheFileHasIt.toImmutable();
        this.sendWhatChanged(asItStoodBefore);
    }

    importDocumentFromText(text: string): void {
        const asItStoodBefore = this.documentAsItStands;
        this.documentAsItStands = new ImmutableAuthorDocument(this.uri, text);
        this.sendWhatChanged(asItStoodBefore);
    }

    changeTheDocument(change: (document: MutableAuthorDocument) => void): void {
        const documentBeingChanged = new MutableAuthorDocument(
            this.uri,
            this.documentAsItStands.text,
        );
        change(documentBeingChanged);
        const documentChange = AuthorDocDiff.diff(
            this.documentAsItStands,
            documentBeingChanged.toImmutable(),
        );
        if (documentChange.empty()) {
            return;
        }
        this.writeTheChange(documentChange);
        this.edited.fire({
            document: this,
            label: "Edit",
            undo: () => this.writeTheChange(documentChange.invert()),
            redo: () => this.writeTheChange(documentChange),
        });
    }

    private writeTheChange(documentChange: AuthorDocDiff): void {
        const asItStoodBefore = this.documentAsItStands;
        this.documentAsItStands = documentChange.applyTheDiff(asItStoodBefore);
        this.sendWhatChanged(asItStoodBefore);
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
            cells: this.documentAsItStands.cells.map(asThePageDrawsIt),
        });
        this.sendProseErrors();
        this.sendWordCounts();
    }

    private sendWhatChanged(asItStoodBefore: ImmutableAuthorDocument): void {
        const thePageDrewItAlready = this.whatThePageJustTyped;
        this.whatThePageJustTyped = null;
        const theSameCellsInTheSameOrder =
            asItStoodBefore.cells.length ===
                this.documentAsItStands.cells.length &&
            asItStoodBefore.cells.every(
                (cell, standing) =>
                    cell.uniqueId ===
                    this.documentAsItStands.cells[standing].uniqueId,
            );
        if (!theSameCellsInTheSameOrder) {
            this.sendDocument();
            return;
        }
        this.synchronizeTheRepresentations();
        const changed = this.documentAsItStands.cells.filter(
            (cell, standing) => {
                const before = asItStoodBefore.cells[standing];
                return (
                    (cell.source !== before.source ||
                        cell.kind !== before.kind ||
                        cell.marker() !== before.marker()) &&
                    !(
                        thePageDrewItAlready?.cellId === cell.uniqueId &&
                        thePageDrewItAlready.markdown === cell.source
                    )
                );
            },
        );
        if (changed.length > 0) {
            void this.panel?.webview.postMessage({
                type: "cells",
                cells: changed.map(asThePageDrawsIt),
            });
        }
        this.sendProseErrors();
        this.sendWordCounts();
    }
}

function asThePageDrawsIt(cell: ImmutableCell): {
    kind: string;
    source: string;
    attrs: Readonly<Record<string, string>>;
} {
    return { kind: cell.kind, source: cell.source, attrs: cell.attrs };
}

export function openAuthorFileEditorSession(
    uri: vscode.Uri,
    text: string,
    edited: vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<AuthorFileEditorSession>
    >,
): AuthorFileEditorSession {
    return new AuthorFileEditorSession(
        new ImmutableAuthorDocument(uri, text),
        edited,
    );
}
