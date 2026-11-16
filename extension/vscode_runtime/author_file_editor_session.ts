import * as vscode from "vscode";

import type { ProseCheckError } from "./commands/check_prose";
import type { AuthorFileEditorFindMatch } from "./commands/find_in_the_document";
import type {
    AuthorFileEditorMessage,
    MessageQueueListener,
} from "./message_queue_between_vscode_and_webview";
import { CharacterRangeSynchronizer } from "authordoc/synchronizers/character_range_synchronizer";
import type { AuthorDocSynchronizer } from "authordoc/author_doc_synchronizer";
import type { AuthorDocChangeVisitor } from "authordoc/author_doc_change_visitor";
import type { CellAdded } from "authordoc/changes/cell_added";
import type { CellHeaderChanged } from "authordoc/changes/cell_header_changed";
import type { CellRemoved } from "authordoc/changes/cell_removed";
import type { CellTextChanged } from "authordoc/changes/cell_text_changed";
import type { CellsMoved } from "authordoc/changes/cells_moved";
import { AuthorDocDiff } from "authordoc/diff";
import { Document } from "authordoc/storydoc";
import type { Cell } from "authordoc/cells/cell";
import {
    NO_STORY_ANNOTATION_SELECTED,
    STORY_ANNOTATION_KINDS,
    type StoryAnnotationSelected,
} from "./story_annotation_selection";
import {
    StoryWordsIterator,
    type StoryTextSpan,
} from "authordoc/iterators/story_words_iterator";
import type { StoryWordRange } from "authordoc/cells/story_word_range";
import { WordCounter } from "authordoc/synchronizers/word_counter";
import type { StoryGeneration } from "./story_generation";

export class AuthorFileEditorSession
    implements vscode.CustomDocument, MessageQueueListener
{
    private readonly proseErrors: ProseCheckError[] = [];
    private readonly findMatches: AuthorFileEditorFindMatch[] = [];
    private readonly howFarEachCellHasBeenWritten = new Map<string, number>();
    private readonly wordCounter = new WordCounter();
    private readonly synchronizers: AuthorDocSynchronizer[];
    private documentAsItStands: Document;

    private panel: vscode.WebviewPanel | undefined;

    private cellTheAuthorIsEditing: string | null = null;

    private whatThePageJustTyped: { cellId: string; markdown: string } | null =
        null;

    private burstBeingTyped: TypingBurst | null = null;

    private readonly storyAnnotationsSelected = new Map<
        string,
        StoryAnnotationSelected
    >();

    private storyTextSelected: StoryTextSpan | null = null;

    private storyGeneration: StoryGeneration | null = null;

    private readonly documentOrSelectionChanged =
        new vscode.EventEmitter<void>();

    readonly onDocumentOrSelectionChanged =
        this.documentOrSelectionChanged.event;

    constructor(
        readonly uri: vscode.Uri,
        documentOpened: Document,
        private readonly edited: vscode.EventEmitter<
            vscode.CustomDocumentEditEvent<AuthorFileEditorSession>
        >,
    ) {
        const proseErrorsSynchronizer = new CharacterRangeSynchronizer(
            this.proseErrors,
        );
        const findMatchesSynchronizer = new CharacterRangeSynchronizer(
            this.findMatches,
        );
        this.synchronizers = [
            proseErrorsSynchronizer,
            findMatchesSynchronizer,
            this.wordCounter,
        ];
        this.documentAsItStands = new Document("", uri.fsPath);
        const opening = AuthorDocDiff.diff(
            this.documentAsItStands,
            documentOpened,
        );
        this.makeTheChange(opening);
    }

    dispose(): void {}

    showOn(panel: vscode.WebviewPanel): void {
        this.panel = panel;
    }

    async onMessage(message: AuthorFileEditorMessage): Promise<void> {
        await message.invoke(this);
    }

    get document(): Document {
        return this.documentAsItStands;
    }

    get theStoryAnnotationsSelected(): Record<string, StoryAnnotationSelected> {
        const selectedOfEachKind = STORY_ANNOTATION_KINDS.map((cellKind) => [
            cellKind,
            this.storyAnnotationsSelected.get(cellKind) ??
                NO_STORY_ANNOTATION_SELECTED,
        ]);
        return Object.fromEntries(selectedOfEachKind);
    }

    get theStoryTextSelected(): StoryTextSpan | null {
        return this.storyTextSelected;
    }

    get theStoryGeneration(): StoryGeneration | null {
        return this.storyGeneration;
    }

    showTheStoryGeneration(storyGeneration: StoryGeneration | null): void {
        this.storyGeneration = storyGeneration;
        this.sendTheStoryGeneration();
        this.documentOrSelectionChanged.fire();
    }

    private sendTheStoryGeneration(): void {
        void this.panel?.webview.postMessage({
            type: "storyGeneration",
            storyGeneration: this.storyGeneration,
        });
    }

    selectTheStoryAnnotation(
        cellKind: string,
        annotationCellId: string | null,
    ): void {
        this.storyAnnotationsSelected.set(cellKind, {
            annotationCellId,
            passageId: null,
        });
        this.sendStoryAnnotationsSelected();
        this.documentOrSelectionChanged.fire();
    }

    selectThePassage(cellKind: string, passageId: string | null): void {
        const annotationSelected =
            this.storyAnnotationsSelected.get(cellKind) ??
            NO_STORY_ANNOTATION_SELECTED;
        this.storyAnnotationsSelected.set(cellKind, {
            annotationCellId: annotationSelected.annotationCellId,
            passageId,
        });
        this.sendStoryAnnotationsSelected();
        this.documentOrSelectionChanged.fire();
    }

    theAuthorSelectedStoryText(storyTextSelected: StoryTextSpan | null): void {
        this.storyTextSelected = storyTextSelected;
        this.documentOrSelectionChanged.fire();
    }

    showTheStoryWordRange(storyWordRange: StoryWordRange): void {
        const storyWords = new StoryWordsIterator(this.documentAsItStands);
        const [storyTextShown] = storyWords.spans(storyWordRange);
        if (storyTextShown) {
            void this.panel?.webview.postMessage({
                type: "storyTextShown",
                storyTextShown,
            });
        }
    }

    theAuthorTypedInTheCell(cellId: string, markdown: string): void {
        this.whatThePageJustTyped = { cellId, markdown };
        const documentChange = this.theChangeThisWouldMake((story) => {
            const cell = story.cellWithId(cellId);
            if (!cell) {
                return story;
            }
            const cellTyped = cell.withSource(markdown);
            const storyTyped = story.withCell(cellTyped);
            return storyTyped;
        });
        if (documentChange.empty()) {
            return;
        }
        const burst = this.burstBeingTyped;
        if (burst?.carriesOn(this.documentAsItStands, documentChange)) {
            this.makeTheChange(documentChange);
            burst.nowReaches(this.documentAsItStands);
            return;
        }
        const documentWhenItBegan = this.documentAsItStands;
        this.makeTheChange(documentChange);
        const everythingTyped = { theChange: documentChange };
        this.burstBeingTyped = new TypingBurst(
            cellId,
            documentWhenItBegan,
            this.documentAsItStands,
            everythingTyped,
        );
        this.recordAnEdit(everythingTyped);
    }

    theAuthorIsEditingTheCell(cellId: string | null): void {
        this.cellTheAuthorIsEditing = cellId;
        this.burstBeingTyped = null;
    }

    importTheFileLeavingTheCellTheAuthorIsEditing(savedText: string): void {
        const beingEdited = this.cellTheAuthorIsEditing;
        const asTheAuthorHasIt = beingEdited
            ? this.documentAsItStands.cellWithId(beingEdited)?.source
            : undefined;
        const documentAsTheFileHasIt = new Document(savedText, this.uri.fsPath);
        const cellInTheFile = beingEdited
            ? documentAsTheFileHasIt.cellWithId(beingEdited)
            : undefined;
        let documentImported = documentAsTheFileHasIt;
        if (asTheAuthorHasIt !== undefined && cellInTheFile) {
            const cellAsTheAuthorHasIt =
                cellInTheFile.withSource(asTheAuthorHasIt);
            documentImported =
                documentAsTheFileHasIt.withCell(cellAsTheAuthorHasIt);
        }
        const fileChange = AuthorDocDiff.diff(
            this.documentAsItStands,
            documentImported,
        );
        this.makeTheChange(fileChange);
    }

    importDocumentFromText(text: string): void {
        const documentImported = new Document(text, this.uri.fsPath);
        const importChange = AuthorDocDiff.diff(
            this.documentAsItStands,
            documentImported,
        );
        this.makeTheChange(importChange);
    }

    changeTheDocument(change: (document: Document) => Document): void {
        const documentChange = this.theChangeThisWouldMake(change);
        if (documentChange.empty()) {
            return;
        }
        this.makeTheChange(documentChange);
        this.recordAnEdit({ theChange: documentChange });
    }

    private theChangeThisWouldMake(
        change: (document: Document) => Document,
    ): AuthorDocDiff {
        const documentChanged = change(this.documentAsItStands);
        const documentChange = AuthorDocDiff.diff(
            this.documentAsItStands,
            documentChanged,
        );
        return documentChange;
    }

    private recordAnEdit(everythingItChanged: {
        theChange: AuthorDocDiff;
    }): void {
        this.edited.fire({
            document: this,
            label: "Edit",
            undo: () => {
                const undoing = everythingItChanged.theChange.invert();
                this.makeTheChange(undoing);
            },
            redo: () => {
                this.makeTheChange(everythingItChanged.theChange);
            },
        });
    }

    // Every change comes as a diff between two consistent documents (an edit
    // made with `withCell` or `withCells`, its undo or redo, the file read
    // back), so applying it keeps the document consistent.
    private makeTheChange(change: AuthorDocDiff): void {
        const before = this.documentAsItStands;
        for (const synchronizer of this.synchronizers) {
            synchronizer.synchronize(before, change);
        }
        this.documentAsItStands = change.applyTheDiff(before);
        this.sendWhatChanged(before);
    }

    async writeTheDocumentToItsFile(): Promise<void> {
        await this.writeTheDocumentTo(this.uri);
    }

    async writeTheDocumentTo(destination: vscode.Uri): Promise<void> {
        this.burstBeingTyped = null;
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

    showFindMatches(findMatches: AuthorFileEditorFindMatch[]): void {
        this.findMatches.splice(0, this.findMatches.length, ...findMatches);
        this.sendFindMatches();
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

    sendStoryAnnotationsSelected(): void {
        void this.panel?.webview.postMessage({
            type: "storyAnnotationsSelected",
            storyAnnotationsSelected: this.theStoryAnnotationsSelected,
        });
    }

    sendFindMatches(): void {
        void this.panel?.webview.postMessage({
            type: "findMatches",
            findMatches: [...this.findMatches],
        });
    }

    sendDocument(): void {
        void this.panel?.webview.postMessage({
            type: "document",
            cells: this.documentAsItStands.cells.map(asThePageDrawsIt),
        });
        this.sendProseErrors();
        this.sendStoryAnnotationsSelected();
        this.sendFindMatches();
        this.sendWordCounts();
        this.sendTheStoryGeneration();
        this.documentOrSelectionChanged.fire();
    }

    private sendWhatChanged(asItStoodBefore: Document): void {
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
        const changed = this.documentAsItStands.cells.filter(
            (cell, standing) => {
                const before = asItStoodBefore.cells[standing];
                const writtenBefore = asThePageDrawsIt(before);
                const writtenNow = asThePageDrawsIt(cell);
                return writtenNow !== writtenBefore;
            },
        );
        const thePageTypedIt = (cell: Cell): boolean =>
            thePageDrewItAlready?.cellId === cell.uniqueId &&
            thePageDrewItAlready.markdown === cell.source;
        const cellsTheHostWrote = changed
            .filter((cell) => !thePageTypedIt(cell))
            .map(asThePageDrawsIt);
        const cellsThePageTyped = changed
            .filter(thePageTypedIt)
            .map(asThePageDrawsIt);
        if (changed.length > 0) {
            void this.panel?.webview.postMessage({
                type: "cells",
                cells: cellsTheHostWrote,
                cellsThePageTyped,
            });
        }
        this.sendProseErrors();
        this.sendFindMatches();
        this.sendWordCounts();
        this.documentOrSelectionChanged.fire();
    }
}

const CHARACTERS_THE_AUTHOR_MAY_TYPE_IN_ONE_BURST = 50;

class TypingBurst implements AuthorDocChangeVisitor<boolean> {
    private charactersTyped = 1;

    constructor(
        private readonly cellId: string,
        private readonly documentWhenItBegan: Document,
        private documentAsItLastStood: Document,
        private readonly everythingTyped: { theChange: AuthorDocDiff },
    ) {}

    carriesOn(
        documentAsItStands: Document,
        documentChange: AuthorDocDiff,
    ): boolean {
        const [onlyChange] = documentChange.changes;
        return (
            documentAsItStands === this.documentAsItLastStood &&
            documentChange.changes.length === 1 &&
            onlyChange.accept(this) &&
            this.charactersTyped < CHARACTERS_THE_AUTHOR_MAY_TYPE_IN_ONE_BURST
        );
    }

    visitCellTextChanged(cellTextChanged: CellTextChanged): boolean {
        return (
            cellTextChanged.cellId === this.cellId &&
            !/\s/.test(cellTextChanged.textWritten)
        );
    }

    visitCellAdded(_cellAdded: CellAdded): boolean {
        return false;
    }

    visitCellRemoved(_cellRemoved: CellRemoved): boolean {
        return false;
    }

    visitCellsMoved(_cellsMoved: CellsMoved): boolean {
        return false;
    }

    visitCellHeaderChanged(_cellHeaderChanged: CellHeaderChanged): boolean {
        return false;
    }

    nowReaches(documentAsItStands: Document): void {
        this.everythingTyped.theChange = AuthorDocDiff.diff(
            this.documentWhenItBegan,
            documentAsItStands,
        );
        this.documentAsItLastStood = documentAsItStands;
        this.charactersTyped += 1;
    }
}

function asThePageDrawsIt(cell: Cell): string {
    const written = Document.fromCells([cell]);
    return written.text;
}

export function openAuthorFileEditorSession(
    uri: vscode.Uri,
    text: string,
    edited: vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<AuthorFileEditorSession>
    >,
): AuthorFileEditorSession {
    const document = new Document(text, uri.fsPath);
    return new AuthorFileEditorSession(uri, document, edited);
}
