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
import { CellAdded } from "authordoc/changes/cell_added";
import type { CellHeaderChanged } from "authordoc/changes/cell_header_changed";
import { CellRemoved } from "authordoc/changes/cell_removed";
import type { CellTextChanged } from "authordoc/changes/cell_text_changed";
import type { CellsMoved } from "authordoc/changes/cells_moved";
import { AuthorDocDiff } from "authordoc/diff";
import { Document } from "authordoc/storydoc";
import { serialize } from "authordoc/parser";
import type { Suggestion } from "authordoc/suggestion";
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
import { StoryGenerationWorkflow } from "./story_generation_workflow";
import { withEverySuggestionApplied } from "./suggestions_applied";

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

    readonly storyGenerationWorkflow = new StoryGenerationWorkflow(this);

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
        this.takeTheSuggestions(documentOpened.suggestions);
    }

    dispose(): void {}

    showOn(panel: vscode.WebviewPanel): void {
        this.panel = panel;
        panel.onDidDispose(() => {
            if (this.panel === panel) {
                this.panel = undefined;
            }
        });
    }

    get isShownInItsEditor(): boolean {
        return this.panel !== undefined;
    }

    async onMessage(message: AuthorFileEditorMessage): Promise<void> {
        await message.invoke(this);
    }

    get document(): Document {
        return this.documentAsItStands;
    }

    get documentAsSuggested(): Document {
        const documentAsSuggested = withEverySuggestionApplied(
            this.documentAsItStands,
        );
        return documentAsSuggested;
    }

    get theStoryAnnotationsSelected(): Record<string, StoryAnnotationSelected> {
        const selectedOfEachKind = STORY_ANNOTATION_KINDS.map((cellKind) => [
            cellKind,
            this.storyAnnotationsSelected.get(cellKind) ??
                NO_STORY_ANNOTATION_SELECTED,
        ]);
        return Object.fromEntries(selectedOfEachKind);
    }

    get theStoryGeneration(): StoryGeneration | null {
        return this.storyGeneration;
    }

    showTheStoryGeneration(storyGeneration: StoryGeneration | null): void {
        this.storyGeneration = storyGeneration;
        this.sendTheStoryGeneration();
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
    }

    theAuthorSelectedStoryText(storyTextSelected: StoryTextSpan | null): void {
        this.storyTextSelected = storyTextSelected;
        this.sendStoryTextSelected();
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
        const typeIt = (story: Document): Document => {
            const cell = story.cellWithId(cellId);
            if (!cell) {
                return story;
            }
            const cellTyped = cell.withSource(markdown);
            const storyTyped = story.withCell(cellTyped);
            return storyTyped;
        };
        const cellIsSuggested =
            this.documentAsItStands.suggestionFor(cellId) !== undefined;
        if (!cellIsSuggested) {
            this.whatThePageJustTyped = { cellId, markdown };
        }
        const documentTyped = cellIsSuggested
            ? this.documentChangedAsSuggested(typeIt)
            : typeIt(this.documentAsItStands);
        const edit = AuthorFileEditorEdit.between(
            this.documentAsItStands,
            documentTyped,
        );
        if (edit.empty()) {
            return;
        }
        const documentTypedAsSuggested =
            withEverySuggestionApplied(documentTyped);
        const keystroke = AuthorDocDiff.diff(
            this.documentAsSuggested,
            documentTypedAsSuggested,
        );
        const burst = this.burstBeingTyped;
        if (burst?.carriesOn(this.documentAsItStands, keystroke)) {
            this.makeTheEdit(edit);
            burst.nowReaches(this.documentAsItStands);
            return;
        }
        const documentWhenItBegan = this.documentAsItStands;
        this.makeTheEdit(edit);
        const everythingTyped = { theEdit: edit };
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
        this.takeTheSuggestions(documentImported.suggestions);
    }

    importDocumentFromText(text: string): void {
        const documentImported = new Document(text, this.uri.fsPath);
        const importChange = AuthorDocDiff.diff(
            this.documentAsItStands,
            documentImported,
        );
        this.makeTheChange(importChange);
        this.takeTheSuggestions(documentImported.suggestions);
    }

    changeTheDocument(change: (document: Document) => Document): void {
        const documentChanged = this.documentChangedAsSuggested(change);
        this.changeTheDocumentInto(documentChanged);
    }

    acceptTheSuggestion(cellId: string): void {
        const document = this.documentAsItStands;
        const suggestion = document.suggestionFor(cellId);
        if (suggestion === undefined) {
            return;
        }
        const diff = suggestion.diff();
        const documentPatched = diff.applyTheDiff(document);
        const documentWithThePatch = document.withCells(documentPatched.cells);
        const documentWithoutTheSuggestion =
            documentWithThePatch.withoutSuggestion(cellId);
        this.changeTheDocumentInto(documentWithoutTheSuggestion);
    }

    rejectTheSuggestion(cellId: string): void {
        const documentWithoutTheSuggestion =
            this.documentAsItStands.withoutSuggestion(cellId);
        this.changeTheDocumentInto(documentWithoutTheSuggestion);
    }

    private documentChangedAsSuggested(
        change: (document: Document) => Document,
    ): Document {
        const documentAsSuggested = this.documentAsSuggested;
        const documentEdited = change(documentAsSuggested);
        const documentChanged = withTheEditsOfTheSuggestedCells(
            this.documentAsItStands,
            documentAsSuggested,
            documentEdited,
        );
        return documentChanged;
    }

    private changeTheDocumentInto(documentChanged: Document): void {
        const edit = AuthorFileEditorEdit.between(
            this.documentAsItStands,
            documentChanged,
        );
        if (edit.empty()) {
            return;
        }
        this.makeTheEdit(edit);
        this.recordAnEdit({ theEdit: edit });
    }

    private makeTheEdit(edit: AuthorFileEditorEdit): void {
        if (!edit.theChange.empty()) {
            this.makeTheChange(edit.theChange);
        }
        const suggestionsLeft = edit.suggestionsItLeaves(
            this.documentAsItStands.suggestions,
        );
        this.takeTheSuggestions(suggestionsLeft);
    }

    private takeTheSuggestions(suggestions: readonly Suggestion[]): void {
        const suggestionsHeld = serialize(
            [],
            this.documentAsItStands.suggestions,
        );
        const suggestionsTaken = serialize([], suggestions);
        if (suggestionsHeld === suggestionsTaken) {
            return;
        }
        this.documentAsItStands = Document.fromCells(
            this.documentAsItStands.cells,
            this.documentAsItStands.path,
            suggestions,
        );
        this.sendSuggestions();
    }

    private sendSuggestions(): void {
        const suggestions = serialize([], this.documentAsItStands.suggestions);
        void this.panel?.webview.postMessage({
            type: "suggestions",
            suggestions,
        });
    }

    private recordAnEdit(everythingItChanged: {
        theEdit: AuthorFileEditorEdit;
    }): void {
        this.edited.fire({
            document: this,
            label: "Edit",
            undo: () => {
                const undoing = everythingItChanged.theEdit.inverted();
                this.makeTheEdit(undoing);
            },
            redo: () => {
                this.makeTheEdit(everythingItChanged.theEdit);
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
        const serialized = this.documentAsItStands.serialize();
        const bytes = new TextEncoder().encode(serialized);
        await vscode.workspace.fs.writeFile(destination, bytes);
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

    sendStoryTextSelected(): void {
        void this.panel?.webview.postMessage({
            type: "storyTextSelected",
            storyTextSelected: this.storyTextSelected,
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
        this.sendSuggestions();
        this.sendProseErrors();
        this.sendStoryAnnotationsSelected();
        this.sendStoryTextSelected();
        this.sendFindMatches();
        this.sendWordCounts();
        this.sendTheStoryGeneration();
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
    }
}

const CHARACTERS_THE_AUTHOR_MAY_TYPE_IN_ONE_BURST = 50;

class TypingBurst implements AuthorDocChangeVisitor<boolean> {
    private charactersTyped = 1;

    constructor(
        private readonly cellId: string,
        private readonly documentWhenItBegan: Document,
        private documentAsItLastStood: Document,
        private readonly everythingTyped: { theEdit: AuthorFileEditorEdit },
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
        this.everythingTyped.theEdit = AuthorFileEditorEdit.between(
            this.documentWhenItBegan,
            documentAsItStands,
        );
        this.documentAsItLastStood = documentAsItStands;
        this.charactersTyped += 1;
    }
}

interface SuggestionOfACellChanged {
    cellId: string;
    before: Suggestion | undefined;
    standingBefore: number;
    after: Suggestion | undefined;
    standingAfter: number;
}

class AuthorFileEditorEdit {
    constructor(
        readonly theChange: AuthorDocDiff,
        private readonly suggestionsChanged: readonly SuggestionOfACellChanged[],
    ) {}

    static between(
        documentBefore: Document,
        documentAfter: Document,
    ): AuthorFileEditorEdit {
        const theChange = AuthorDocDiff.diff(documentBefore, documentAfter);
        const suggestionsBefore = documentBefore.suggestions;
        const suggestionsAfter = documentAfter.suggestions;
        const everySuggestion = [...suggestionsBefore, ...suggestionsAfter];
        const cellIdsSuggested = new Set(
            everySuggestion.map((suggestion) => suggestion.cellId),
        );
        const suggestionsChanged = [...cellIdsSuggested].flatMap((cellId) => {
            const standingBefore = suggestionsBefore.findIndex(
                (suggestion) => suggestion.cellId === cellId,
            );
            const standingAfter = suggestionsAfter.findIndex(
                (suggestion) => suggestion.cellId === cellId,
            );
            const before = suggestionsBefore[standingBefore];
            const after = suggestionsAfter[standingAfter];
            const unchanged =
                before !== undefined &&
                after !== undefined &&
                suggestedAlike(before, after);
            if (unchanged) {
                return [];
            }
            return [{ cellId, before, standingBefore, after, standingAfter }];
        });
        const edit = new AuthorFileEditorEdit(theChange, suggestionsChanged);
        return edit;
    }

    empty(): boolean {
        return this.theChange.empty() && this.suggestionsChanged.length === 0;
    }

    inverted(): AuthorFileEditorEdit {
        const theChangeInverted = this.theChange.invert();
        const suggestionsChangedBack = this.suggestionsChanged.map(
            (changed) => ({
                cellId: changed.cellId,
                before: changed.after,
                standingBefore: changed.standingAfter,
                after: changed.before,
                standingAfter: changed.standingBefore,
            }),
        );
        const editInverted = new AuthorFileEditorEdit(
            theChangeInverted,
            suggestionsChangedBack,
        );
        return editInverted;
    }

    suggestionsItLeaves(
        suggestions: readonly Suggestion[],
    ): readonly Suggestion[] {
        const inTheOrderTheyStandAfter = [...this.suggestionsChanged].sort(
            (changed, other) => changed.standingAfter - other.standingAfter,
        );
        let suggestionsLeft = suggestions;
        for (const changed of inTheOrderTheyStandAfter) {
            const others = suggestionsLeft.filter(
                (suggestion) => suggestion.cellId !== changed.cellId,
            );
            if (changed.after === undefined) {
                suggestionsLeft = others;
                continue;
            }
            const standing = Math.min(changed.standingAfter, others.length);
            const othersBefore = others.slice(0, standing);
            const othersAfter = others.slice(standing);
            suggestionsLeft = [...othersBefore, changed.after, ...othersAfter];
        }
        return suggestionsLeft;
    }
}

function writtenAlike(cell: Cell | undefined, other: Cell | undefined): boolean {
    const written = cell === undefined ? undefined : asThePageDrawsIt(cell);
    const otherWritten =
        other === undefined ? undefined : asThePageDrawsIt(other);
    return written === otherWritten;
}

function suggestedAlike(suggestion: Suggestion, other: Suggestion): boolean {
    const written = serialize([], [suggestion]);
    const otherWritten = serialize([], [other]);
    return written === otherWritten;
}

function suggestionOfTheEdit(
    documentAsItStands: Document,
    documentEdited: Document,
    cellId: string,
    suggestion: Suggestion,
): Suggestion | null {
    const cellAsItStands = documentAsItStands.cellWithId(cellId);
    const cellEdited = documentEdited.cellWithId(cellId);
    if (cellEdited === undefined) {
        if (cellAsItStands === undefined) {
            return null;
        }
        const cellIndex = documentAsItStands.cells.findIndex(
            (cell) => cell.uniqueId === cellId,
        );
        const cellRemoved = new CellRemoved(cellIndex, cellAsItStands);
        const diffRemoving = new AuthorDocDiff([cellRemoved]);
        const suggestionRemoving = suggestion.withTheDiff(diffRemoving);
        return suggestionRemoving;
    }
    if (cellAsItStands === undefined) {
        const cellIndex = documentEdited.cells.findIndex(
            (cell) => cell.uniqueId === cellId,
        );
        const cellAdded = new CellAdded(cellIndex, cellEdited);
        const diffAdding = new AuthorDocDiff([cellAdded]);
        const suggestionAdding = suggestion.withTheDiff(diffAdding);
        return suggestionAdding;
    }
    const documentOfTheCell = Document.fromCells([cellAsItStands]);
    const documentOfTheCellEdited = Document.fromCells([cellEdited]);
    const diff = AuthorDocDiff.diff(documentOfTheCell, documentOfTheCellEdited);
    if (diff.empty()) {
        return null;
    }
    const suggestionEdited = suggestion.withTheDiff(diff);
    return suggestionEdited;
}

function withTheSuggestedCellsAsTheyStand(
    cellsEdited: readonly Cell[],
    documentAsItStands: Document,
): Cell[] {
    const cells = [...cellsEdited];
    documentAsItStands.cells.forEach((cellAsItStands, standing) => {
        const kept = cells.some(
            (cell) => cell.uniqueId === cellAsItStands.uniqueId,
        );
        const suggested =
            documentAsItStands.suggestionFor(cellAsItStands.uniqueId) !==
            undefined;
        if (kept || !suggested) {
            return;
        }
        const cellsStandingBefore = documentAsItStands.cells.slice(0, standing);
        const cellsStandingBeforeNearestFirst = cellsStandingBefore.reverse();
        const nearestKeptBefore = cellsStandingBeforeNearestFirst.find(
            (before) => cells.some((cell) => cell.uniqueId === before.uniqueId),
        );
        const keptBeforeAt =
            nearestKeptBefore === undefined
                ? -1
                : cells.findIndex(
                      (cell) => cell.uniqueId === nearestKeptBefore.uniqueId,
                  );
        cells.splice(keptBeforeAt + 1, 0, cellAsItStands);
    });
    return cells;
}

function withTheEditsOfTheSuggestedCells(
    documentAsItStands: Document,
    documentAsSuggested: Document,
    documentEdited: Document,
): Document {
    const suggestionsLeft = documentEdited.suggestions.flatMap(
        (suggestion) => {
            const suggestionAsItStands = documentAsItStands.suggestionFor(
                suggestion.cellId,
            );
            const theChangeSuggestedIt =
                suggestionAsItStands === undefined ||
                !suggestedAlike(suggestionAsItStands, suggestion);
            if (theChangeSuggestedIt) {
                return [suggestion];
            }
            const cellSuggested = documentAsSuggested.cellWithId(
                suggestion.cellId,
            );
            const cellEdited = documentEdited.cellWithId(suggestion.cellId);
            if (writtenAlike(cellSuggested, cellEdited)) {
                return [suggestionAsItStands];
            }
            const suggestionEdited = suggestionOfTheEdit(
                documentAsItStands,
                documentEdited,
                suggestion.cellId,
                suggestionAsItStands,
            );
            return suggestionEdited === null ? [] : [suggestionEdited];
        },
    );
    const cellsEdited = documentEdited.cells.flatMap((cell) => {
        if (documentAsItStands.suggestionFor(cell.uniqueId) === undefined) {
            return [cell];
        }
        const cellAsItStands = documentAsItStands.cellWithId(cell.uniqueId);
        return cellAsItStands === undefined ? [] : [cellAsItStands];
    });
    const cells = withTheSuggestedCellsAsTheyStand(
        cellsEdited,
        documentAsItStands,
    );
    const documentWithTheCells = documentAsItStands.withCells(cells);
    const documentWithTheSuggestions = Document.fromCells(
        documentWithTheCells.cells,
        documentWithTheCells.path,
        suggestionsLeft,
    );
    return documentWithTheSuggestions;
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
    const session = new AuthorFileEditorSession(uri, document, edited);
    return session;
}
