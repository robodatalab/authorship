import * as vscode from "vscode";

import type { ProseCheckError } from "./commands/check_prose";
import type {
    AuthorFileEditorFindMatch,
    AuthorFileEditorFindMatchInTheProse,
} from "./commands/find_in_the_document";
import type {
    AuthorFileEditorMessage,
    MessageQueueListener,
} from "./message_queue_between_vscode_and_webview";
import { CharacterRangeSynchronizer } from "./storydoc/synchronizers/character_range_synchronizer";
import type { AuthorDocSynchronizer } from "./storydoc/author_doc_synchronizer";
import { AuthorDocDiff } from "./storydoc/diff";
import { Document } from "./storydoc/storydoc";
import type { Cell } from "./storydoc/cells/cell";
import { synchronizeTheStoryWordRanges } from "./storydoc/story_words";
import {
    NO_STORY_ANNOTATION_SELECTED,
    STORY_ANNOTATION_KINDS,
    type StoryAnnotationSelected,
} from "./story_annotation_selection";
import {
    StoryWordsIterator,
    type StoryTextSpan,
} from "./storydoc/iterators/story_words_iterator";
import type { StoryWordRange } from "./storydoc/cells/story_word_range";
import { WordCounter } from "./storydoc/synchronizers/word_counter";

export class AuthorFileEditorSession
    implements vscode.CustomDocument, MessageQueueListener
{
    private readonly proseErrors: ProseCheckError[] = [];
    private readonly findMatches: AuthorFileEditorFindMatch[] = [];
    private readonly findMatchesInTheProse: AuthorFileEditorFindMatchInTheProse[] =
        [];
    private readonly howFarEachCellHasBeenWritten = new Map<string, number>();
    private readonly wordCounter = new WordCounter();
    private readonly synchronizers: AuthorDocSynchronizer[];
    private documentAsTheLastSynchronizationLeftIt: Document;

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

    private readonly documentOrSelectionChanged =
        new vscode.EventEmitter<void>();

    readonly onDocumentOrSelectionChanged =
        this.documentOrSelectionChanged.event;

    constructor(
        readonly uri: vscode.Uri,
        private documentAsItStands: Document,
        private readonly edited: vscode.EventEmitter<
            vscode.CustomDocumentEditEvent<AuthorFileEditorSession>
        >,
    ) {
        const proseErrorsSynchronizer = new CharacterRangeSynchronizer(
            this.proseErrors,
        );
        const findMatchesInTheProseSynchronizer =
            new CharacterRangeSynchronizer(this.findMatchesInTheProse);
        this.synchronizers = [
            proseErrorsSynchronizer,
            findMatchesInTheProseSynchronizer,
            this.wordCounter,
        ];
        this.documentAsTheLastSynchronizationLeftIt = new Document(
            "",
            uri.fsPath,
        );
        this.synchronizeTheRepresentations();
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

    selectTheStoryAnnotation(
        cellKind: string,
        annotationCellId: string | null,
    ): void {
        this.storyAnnotationsSelected.set(cellKind, {
            annotationCellId,
            passage: null,
        });
        this.sendStoryAnnotationsSelected();
        this.documentOrSelectionChanged.fire();
    }

    selectThePassage(cellKind: string, passage: number | null): void {
        const annotationSelected =
            this.storyAnnotationsSelected.get(cellKind) ??
            NO_STORY_ANNOTATION_SELECTED;
        this.storyAnnotationsSelected.set(cellKind, {
            annotationCellId: annotationSelected.annotationCellId,
            passage,
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
            const cellIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === cellId,
            );
            if (cellIndex === -1) {
                return;
            }
            const cell = story.cells[cellIndex];
            story.cells[cellIndex] = cell.withSource(markdown);
        });
        if (documentChange.empty()) {
            return;
        }
        const burst = this.burstBeingTyped;
        if (burst?.carriesOn(this.documentAsItStands, documentChange)) {
            this.writeTheChange(documentChange);
            burst.nowReaches(this.documentAsItStands);
            return;
        }
        const documentWhenItBegan = this.documentAsItStands;
        this.writeTheChange(documentChange);
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
        const asItStoodBefore = this.documentAsItStands;
        const documentAsTheFileHasIt = new Document(savedText, this.uri.fsPath);
        const cellIndex = documentAsTheFileHasIt.cells.findIndex(
            (cell) => cell.uniqueId === beingEdited,
        );
        if (beingEdited && asTheAuthorHasIt !== undefined && cellIndex !== -1) {
            const cell = documentAsTheFileHasIt.cells[cellIndex];
            documentAsTheFileHasIt.cells[cellIndex] =
                cell.withSource(asTheAuthorHasIt);
        }
        this.documentAsItStands = documentAsTheFileHasIt;
        this.sendWhatChanged(asItStoodBefore);
    }

    importDocumentFromText(text: string): void {
        const asItStoodBefore = this.documentAsItStands;
        this.documentAsItStands = new Document(text, this.uri.fsPath);
        this.sendWhatChanged(asItStoodBefore);
    }

    changeTheDocument(change: (document: Document) => void): void {
        const documentChange = this.theChangeThisWouldMake(change);
        if (documentChange.empty()) {
            return;
        }
        this.writeTheChange(documentChange);
        this.recordAnEdit({ theChange: documentChange });
    }

    private theChangeThisWouldMake(
        change: (document: Document) => void,
    ): AuthorDocDiff {
        const documentBeingChanged = new Document(
            this.documentAsItStands.text,
            this.uri.fsPath,
        );
        change(documentBeingChanged);
        synchronizeTheStoryWordRanges(
            this.documentAsItStands,
            documentBeingChanged,
        );
        return AuthorDocDiff.diff(
            this.documentAsItStands,
            documentBeingChanged,
        );
    }

    private recordAnEdit(everythingItChanged: {
        theChange: AuthorDocDiff;
    }): void {
        this.edited.fire({
            document: this,
            label: "Edit",
            undo: () =>
                this.writeTheChange(everythingItChanged.theChange.invert()),
            redo: () => this.writeTheChange(everythingItChanged.theChange),
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
        const findMatchesInTheProse = findMatches.filter(
            (findMatch): findMatch is AuthorFileEditorFindMatchInTheProse =>
                findMatch.attributeName === null,
        );
        this.findMatchesInTheProse.splice(
            0,
            this.findMatchesInTheProse.length,
            ...findMatchesInTheProse,
        );
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

    private synchronizeTheRepresentations(): void {
        const before = this.documentAsTheLastSynchronizationLeftIt;
        const after = this.documentAsItStands;
        const change = AuthorDocDiff.diff(before, after);
        for (const synchronizer of this.synchronizers) {
            synchronizer.synchronize(before, change);
        }
        this.documentAsTheLastSynchronizationLeftIt = after;
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
        this.synchronizeTheRepresentations();
        void this.panel?.webview.postMessage({
            type: "document",
            cells: this.documentAsItStands.cells.map(asThePageDrawsIt),
        });
        this.sendProseErrors();
        this.sendStoryAnnotationsSelected();
        this.sendFindMatches();
        this.sendWordCounts();
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
        this.synchronizeTheRepresentations();
        const changed = this.documentAsItStands.cells.filter(
            (cell, standing) => {
                const before = asItStoodBefore.cells[standing];
                return (
                    cell.source !== before.source ||
                    cell.kind !== before.kind ||
                    cell.marker() !== before.marker()
                );
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

class TypingBurst {
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
        const cellChanged = documentChange.cells[0];
        return (
            documentAsItStands === this.documentAsItLastStood &&
            documentChange.cells.length === 1 &&
            documentChange.cellIdsInRhs === undefined &&
            cellChanged.cellId === this.cellId &&
            !/\s/.test(cellChanged.textInRhs) &&
            this.charactersTyped < CHARACTERS_THE_AUTHOR_MAY_TYPE_IN_ONE_BURST
        );
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

function asThePageDrawsIt(cell: Cell): {
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
    const document = new Document(text, uri.fsPath);
    return new AuthorFileEditorSession(uri, document, edited);
}
