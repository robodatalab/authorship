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
import { AuthorDocSynchronizer } from "./storydoc/author_doc_synch";
import { AuthorDocDiff } from "./storydoc/diff";
import {
    ImmutableAuthorDocument,
    MutableAuthorDocument,
    type ImmutableCell,
} from "./storydoc/model";
import {
    storyTextSpansOf,
    storyWordsIn,
    synchronizeTheStoryWordRanges,
    type StoryTextSpan,
    type StoryWordRange,
} from "./storydoc/story_words";
import { WordCounter } from "./storydoc/word_counter";

export class AuthorFileEditorSession
    implements vscode.CustomDocument, MessageQueueListener
{
    private readonly proseErrors: ProseCheckError[] = [];
    private readonly findMatches: AuthorFileEditorFindMatch[] = [];
    private readonly findMatchesInTheProse: AuthorFileEditorFindMatchInTheProse[] =
        [];
    private readonly howFarEachCellHasBeenWritten = new Map<string, number>();
    private readonly proseErrorsSynchronizer: AuthorDocSynchronizer<ProseCheckError>;
    private readonly findMatchesInTheProseSynchronizer: AuthorDocSynchronizer<AuthorFileEditorFindMatchInTheProse>;
    private readonly wordCounter = new WordCounter();
    private documentAsTheLastSynchronizationLeftIt: ImmutableAuthorDocument;

    private panel: vscode.WebviewPanel | undefined;

    private cellTheAuthorIsEditing: string | null = null;

    private whatThePageJustTyped: { cellId: string; markdown: string } | null =
        null;

    private burstBeingTyped: TypingBurst | null = null;

    private salientConceptSelected: string | null = null;

    private plotSelected: string | null = null;

    private storyTextSelected: StoryTextSpan | null = null;

    private readonly documentOrSelectionChanged =
        new vscode.EventEmitter<void>();

    readonly onDocumentOrSelectionChanged =
        this.documentOrSelectionChanged.event;

    constructor(
        private documentAsItStands: ImmutableAuthorDocument,
        private readonly edited: vscode.EventEmitter<
            vscode.CustomDocumentEditEvent<AuthorFileEditorSession>
        >,
    ) {
        this.proseErrorsSynchronizer = new AuthorDocSynchronizer(
            this.proseErrors,
        );
        this.findMatchesInTheProseSynchronizer = new AuthorDocSynchronizer(
            this.findMatchesInTheProse,
        );
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

    get theSalientConceptSelected(): string | null {
        return this.salientConceptSelected;
    }

    get thePlotSelected(): string | null {
        return this.plotSelected;
    }

    get theStoryTextSelected(): StoryTextSpan | null {
        return this.storyTextSelected;
    }

    selectTheSalientConcept(conceptCellId: string | null): void {
        this.salientConceptSelected = conceptCellId;
        this.sendSalientConceptSelected();
        this.documentOrSelectionChanged.fire();
    }

    selectThePlot(plotCellId: string | null): void {
        this.plotSelected = plotCellId;
        this.sendPlotSelected();
        this.documentOrSelectionChanged.fire();
    }

    theAuthorSelectedStoryText(storyTextSelected: StoryTextSpan | null): void {
        this.storyTextSelected = storyTextSelected;
        this.documentOrSelectionChanged.fire();
    }

    showTheStoryWordRange(storyWordRange: StoryWordRange): void {
        const storyWords = storyWordsIn(this.documentAsItStands.cells);
        const [storyTextShown] = storyTextSpansOf(storyWords, storyWordRange);
        if (storyTextShown) {
            void this.panel?.webview.postMessage({
                type: "storyTextShown",
                storyTextShown,
            });
        }
    }

    theAuthorTypedInTheCell(cellId: string, markdown: string): void {
        this.whatThePageJustTyped = { cellId, markdown };
        const documentChange = this.theChangeThisWouldMake((story) =>
            story.cellWithId(cellId)?.replaceMarkdown(markdown),
        );
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
        const documentChange = this.theChangeThisWouldMake(change);
        if (documentChange.empty()) {
            return;
        }
        this.writeTheChange(documentChange);
        this.recordAnEdit({ theChange: documentChange });
    }

    private theChangeThisWouldMake(
        change: (document: MutableAuthorDocument) => void,
    ): AuthorDocDiff {
        const documentBeingChanged = new MutableAuthorDocument(
            this.uri,
            this.documentAsItStands.text,
        );
        change(documentBeingChanged);
        synchronizeTheStoryWordRanges(
            this.documentAsItStands,
            documentBeingChanged,
        );
        return AuthorDocDiff.diff(
            this.documentAsItStands,
            documentBeingChanged.toImmutable(),
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
        this.proseErrorsSynchronizer.synchronize(
            this.documentAsTheLastSynchronizationLeftIt,
            this.documentAsItStands,
        );
        this.findMatchesInTheProseSynchronizer.synchronize(
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

    sendSalientConceptSelected(): void {
        void this.panel?.webview.postMessage({
            type: "salientConceptSelected",
            salientConceptSelected: this.salientConceptSelected,
        });
    }

    sendPlotSelected(): void {
        void this.panel?.webview.postMessage({
            type: "plotSelected",
            plotSelected: this.plotSelected,
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
        this.sendSalientConceptSelected();
        this.sendPlotSelected();
        this.sendFindMatches();
        this.sendWordCounts();
        this.documentOrSelectionChanged.fire();
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
                    cell.source !== before.source ||
                    cell.kind !== before.kind ||
                    cell.marker() !== before.marker()
                );
            },
        );
        const thePageTypedIt = (cell: ImmutableCell): boolean =>
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
        private readonly documentWhenItBegan: ImmutableAuthorDocument,
        private documentAsItLastStood: ImmutableAuthorDocument,
        private readonly everythingTyped: { theChange: AuthorDocDiff },
    ) {}

    carriesOn(
        documentAsItStands: ImmutableAuthorDocument,
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

    nowReaches(documentAsItStands: ImmutableAuthorDocument): void {
        this.everythingTyped.theChange = AuthorDocDiff.diff(
            this.documentWhenItBegan,
            documentAsItStands,
        );
        this.documentAsItLastStood = documentAsItStands;
        this.charactersTyped += 1;
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
