import * as vscode from "vscode";

import type { ProseCheckError } from "./runtime_commands/check_prose";
import type { AuthorFileEditorFindMatch } from "./runtime_commands/find_in_the_document";
import { authorDocumentCommandCards } from "./runtime_commands/author_document_commands";
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
import type {
    StoryGeneration,
    StoryGenerationStageJob,
} from "./story_generation/story_generation";
import {
    StoryGenerationWorkflow,
    storyGenerationOf,
} from "./story_generation/story_generation_workflow";
import { withEverySuggestionApplied } from "./tools/suggestions_applied";
import { UpdateCellsWebviewCommand } from "./webview_commands/update_cells";
import { SetCellsBeingWrittenWebviewCommand } from "./webview_commands/set_cells_being_written";
import { SetCommandCardsWebviewCommand } from "./webview_commands/set_command_cards";
import { SetAllCellsWebviewCommand } from "./webview_commands/set_all_cells";
import { SetFindMatchesWebviewCommand } from "./webview_commands/set_find_matches";
import { SetProseErrorsWebviewCommand } from "./webview_commands/set_prose_errors";
import { SetStoryAnnotationsSelectedWebviewCommand } from "./webview_commands/set_story_annotations_selected";
import { SetStoryGenerationWebviewCommand } from "./webview_commands/set_story_generation";
import { SetStoryTextSelectedWebviewCommand } from "./webview_commands/set_story_text_selected";
import { SetStoryTextShownWebviewCommand } from "./webview_commands/set_story_text_shown";
import { SetSuggestionsWebviewCommand } from "./webview_commands/set_suggestions";
import type { WebviewCommand } from "./webview_commands/webview_command";
import { SetWordCountsWebviewCommand } from "./webview_commands/set_word_counts";

export class AuthorFileEditorSession implements vscode.CustomDocument {
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

    private progressOfTheStageRunning:
        | StoryGenerationStageJob["progress"]
        | null = null;

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
        const storyGeneration = storyGenerationOf(
            this.documentAsItStands,
            this.progressOfTheStageRunning,
        );
        return storyGeneration;
    }

    showTheStageRunning(progress: StoryGenerationStageJob["progress"]): void {
        this.progressOfTheStageRunning = progress;
        this.sendTheStoryGeneration();
    }

    showNoStageRunning(): void {
        this.progressOfTheStageRunning = null;
        this.sendTheStoryGeneration();
    }

    private sendTheStoryGeneration(): void {
        const storyGeneration = this.theStoryGeneration;
        const command = new SetStoryGenerationWebviewCommand(storyGeneration);
        this.sendToTheWebview(command);
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
            const command = new SetStoryTextShownWebviewCommand(storyTextShown);
            this.sendToTheWebview(command);
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
        this.storyGenerationWorkflow.suggestionRejected(cellId);
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
        const command = new SetSuggestionsWebviewCommand(
            this.documentAsItStands.suggestions,
        );
        this.sendToTheWebview(command);
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

    sendCommandCards(): void {
        const commandCards = authorDocumentCommandCards();
        const command = new SetCommandCardsWebviewCommand(commandCards);
        this.sendToTheWebview(command);
    }

    sendCellsBeingWritten(): void {
        const cellsBeingWritten = Object.fromEntries(
            this.howFarEachCellHasBeenWritten,
        );
        const command = new SetCellsBeingWrittenWebviewCommand(cellsBeingWritten);
        this.sendToTheWebview(command);
    }

    sendWordCounts(): void {
        const command = new SetWordCountsWebviewCommand(
            this.wordCounter.wordsInEverySection,
            this.wordCounter.wordsInTheDocument,
        );
        this.sendToTheWebview(command);
    }

    sendProseErrors(): void {
        const command = new SetProseErrorsWebviewCommand([...this.proseErrors]);
        this.sendToTheWebview(command);
    }

    sendStoryAnnotationsSelected(): void {
        const command = new SetStoryAnnotationsSelectedWebviewCommand(
            this.theStoryAnnotationsSelected,
        );
        this.sendToTheWebview(command);
    }

    sendStoryTextSelected(): void {
        const command = new SetStoryTextSelectedWebviewCommand(
            this.storyTextSelected,
        );
        this.sendToTheWebview(command);
    }

    sendFindMatches(): void {
        const command = new SetFindMatchesWebviewCommand([...this.findMatches]);
        this.sendToTheWebview(command);
    }

    sendDocument(): void {
        const command = new SetAllCellsWebviewCommand(
            this.documentAsItStands.cells,
        );
        this.sendToTheWebview(command);
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
        const cellsTheHostWrote = changed.filter(
            (cell) => !thePageTypedIt(cell),
        );
        const cellsThePageTyped = changed.filter(thePageTypedIt);
        if (changed.length > 0) {
            const command = new UpdateCellsWebviewCommand(
                cellsTheHostWrote,
                cellsThePageTyped,
            );
            this.sendToTheWebview(command);
        }
        this.sendProseErrors();
        this.sendFindMatches();
        this.sendWordCounts();
        this.sendTheStoryGeneration();
    }

    private sendToTheWebview(command: WebviewCommand): void {
        const serialized = command.serialize();
        void this.panel?.webview.postMessage(serialized);
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

function writtenAlike(
    cell: Cell | undefined,
    other: Cell | undefined,
): boolean {
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
    cellAsItStands: Cell,
    cellEdited: Cell,
    suggestion: Suggestion,
): Suggestion | null {
    const documentOfTheCell = Document.fromCells([cellAsItStands]);
    const documentOfTheCellEdited = Document.fromCells([cellEdited]);
    const diff = AuthorDocDiff.diff(documentOfTheCell, documentOfTheCellEdited);
    if (diff.empty()) {
        return null;
    }
    const suggestionEdited = suggestion.withTheDiff(diff);
    return suggestionEdited;
}

function withTheEditsOfTheSuggestedCells(
    documentAsItStands: Document,
    documentAsSuggested: Document,
    documentEdited: Document,
): Document {
    const suggestionsLeft = documentEdited.suggestions.flatMap((suggestion) => {
        const suggestionAsItStands = documentAsItStands.suggestionFor(
            suggestion.cellId,
        );
        const theChangeSuggestedIt =
            suggestionAsItStands === undefined ||
            !suggestedAlike(suggestionAsItStands, suggestion);
        if (theChangeSuggestedIt) {
            return [suggestion];
        }
        const cellAsItStands = documentAsItStands.cellWithId(suggestion.cellId);
        const cellSuggested = documentAsSuggested.cellWithId(suggestion.cellId);
        const cellEdited = documentEdited.cellWithId(suggestion.cellId);
        if (
            cellAsItStands === undefined ||
            cellEdited === undefined ||
            writtenAlike(cellSuggested, cellEdited)
        ) {
            return [suggestionAsItStands];
        }
        const suggestionEdited = suggestionOfTheEdit(
            cellAsItStands,
            cellEdited,
            suggestionAsItStands,
        );
        return suggestionEdited === null ? [] : [suggestionEdited];
    });
    const cellsEdited = documentEdited.cells.flatMap((cell) => {
        if (documentAsItStands.suggestionFor(cell.uniqueId) === undefined) {
            return [cell];
        }
        const cellAsItStands = documentAsItStands.cellWithId(cell.uniqueId);
        return cellAsItStands === undefined ? [] : [cellAsItStands];
    });
    const documentWithTheCells = documentAsItStands.withCells(cellsEdited);
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
