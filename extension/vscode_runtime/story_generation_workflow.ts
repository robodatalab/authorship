import * as vscode from "vscode";

import type { Cell } from "authordoc/cells/cell";
import { CharacterCell } from "authordoc/cells/character_cell";
import { UnknownCell } from "authordoc/cells/unknown_cell";
import { CellAdded } from "authordoc/changes/cell_added";
import { AuthorDocDiff } from "authordoc/diff";
import { Document } from "authordoc/storydoc";
import { Suggestion } from "authordoc/suggestion";
import type { AuthorFileEditorSession } from "./author_file_editor_session";
import { fetchFromServer } from "./server/fetch";
import { awaitServerJob, startServerJob } from "./server/jobs";
import type {
    StoryGeneration,
    StoryGenerationAsked,
    StoryGenerationShown,
    StoryGenerationStageJob,
    StoryGenerationWorkflowStage,
} from "./story_generation";

const STAGES_IN_ORDER = [
    "concept titles",
    "concepts",
    "cast",
    "plots",
    "mesh",
    "scenes",
    "choices",
    "validity",
];

const CHECKPOINT = "GeneratedDocumentCheckpoint";

const STAGE_IN_THE_CHECKPOINT = "stage: ";

const STAGE_DONE = "True";

const STAGE_AWAITING_REVIEW = "Review";

const STAGE_NOT_DONE = "False";

const REVIEW_SHOWS = "review shows: ";

const SHOWN_WHEN_THE_CHECKPOINT_SAYS_NOTHING: StoryGenerationShown = {
    kind: "editor",
};

function whatTheCastLeavesUndone(document: Document): string | null {
    const characters = document.cells.filter(
        (cell): cell is CharacterCell => cell instanceof CharacterCell,
    );
    if (characters.length === 0) {
        return "Add the characters of the story before continuing: the cast has none.";
    }
    const untied = characters.filter(
        (character) => character.concepts(document).length === 0,
    );
    if (untied.length === 0) {
        return null;
    }
    const namesOfTheUntied = untied.map((character) => character.title).join(", ");
    return `Tie every character to the concepts it supports before continuing: ${namesOfTheUntied} supports none.`;
}

const LEFT_UNDONE_BY_THE_STAGE: ReadonlyMap<
    string,
    (document: Document) => string | null
> = new Map([["cast", whatTheCastLeavesUndone]]);

function suggestionOfTheStage(
    storyBeforeTheStage: Document,
    cell: Cell,
    cellIndex: number,
): Suggestion | null {
    if (cell.kind === CHECKPOINT) {
        return null;
    }
    const cellBefore = storyBeforeTheStage.cellWithId(cell.uniqueId);
    if (cellBefore === undefined) {
        const cellAdded = new CellAdded(cellIndex, cell);
        const diffAdding = new AuthorDocDiff([cellAdded]);
        const suggestionAdding = new Suggestion(cell.uniqueId, diffAdding);
        return suggestionAdding;
    }
    const documentBefore = Document.fromCells([cellBefore]);
    const documentAfter = Document.fromCells([cell]);
    const diff = AuthorDocDiff.diff(documentBefore, documentAfter);
    if (diff.empty()) {
        return null;
    }
    const suggestion = new Suggestion(cell.uniqueId, diff);
    return suggestion;
}

function withTheSuggestionsOfTheStage(
    storyBeforeTheStage: Document,
    storyTheStageLeaves: Document,
): Document {
    const suggestions = storyTheStageLeaves.cells.flatMap((cell, cellIndex) => {
        const suggestion = suggestionOfTheStage(
            storyBeforeTheStage,
            cell,
            cellIndex,
        );
        return suggestion === null ? [] : [suggestion];
    });
    const documentWithTheSuggestions = Document.fromCells(
        storyBeforeTheStage.cells,
        storyBeforeTheStage.path,
        suggestions,
    );
    return documentWithTheSuggestions;
}

function shownInTheCheckpoint(document: Document): StoryGenerationShown {
    const checkpoint = document.getCell(UnknownCell, CHECKPOINT);
    const lines = checkpoint?.source.split("\n") ?? [];
    const line = lines.find((written) => written.startsWith(REVIEW_SHOWS));
    if (line === undefined) {
        return SHOWN_WHEN_THE_CHECKPOINT_SAYS_NOTHING;
    }
    const shownWritten = line.slice(REVIEW_SHOWS.length);
    const shown = JSON.parse(shownWritten) as StoryGenerationShown;
    return shown;
}

function stateOfEachStageInTheCheckpoint(
    document: Document,
): Map<string, string> {
    const checkpoint = document.getCell(UnknownCell, CHECKPOINT);
    const lines = checkpoint?.source.split("\n") ?? [];
    const stateOfEachStage = new Map<string, string>();
    for (const line of lines) {
        if (!line.startsWith(STAGE_IN_THE_CHECKPOINT)) {
            continue;
        }
        const written = line.slice(STAGE_IN_THE_CHECKPOINT.length);
        const stateAt = written.lastIndexOf(": ");
        const stage = written.slice(0, stateAt);
        const state = written.slice(stateAt + 2);
        stateOfEachStage.set(stage, state);
    }
    return stateOfEachStage;
}

function stagesOf(document: Document): StoryGenerationWorkflowStage[] {
    const stateOfEachStage = stateOfEachStageInTheCheckpoint(document);
    const stages = STAGES_IN_ORDER.map((name) => {
        const done = stateOfEachStage.get(name) === STAGE_DONE;
        return { name, done };
    });
    return stages;
}

function stageAwaitingReview(document: Document): string | undefined {
    const stateOfEachStage = stateOfEachStageInTheCheckpoint(document);
    const stageAwaiting = STAGES_IN_ORDER.find(
        (name) => stateOfEachStage.get(name) === STAGE_AWAITING_REVIEW,
    );
    return stageAwaiting;
}

function withTheStageIn(
    document: Document,
    stageChanged: string,
    stateOfTheStage: string,
): Document {
    const lines = stageLinesWithTheStageIn(
        document,
        stageChanged,
        stateOfTheStage,
    );
    const documentWithTheStageChanged = withTheCheckpointWritten(
        document,
        lines,
    );
    return documentWithTheStageChanged;
}

function withTheStageAwaitingReview(
    document: Document,
    stageAwaiting: string,
    shown: StoryGenerationShown,
): Document {
    const stageLines = stageLinesWithTheStageIn(
        document,
        stageAwaiting,
        STAGE_AWAITING_REVIEW,
    );
    const shownWritten = JSON.stringify(shown);
    const lines = [...stageLines, `${REVIEW_SHOWS}${shownWritten}`];
    const documentWithTheStageAwaitingReview = withTheCheckpointWritten(
        document,
        lines,
    );
    return documentWithTheStageAwaitingReview;
}

function stageLinesWithTheStageIn(
    document: Document,
    stageChanged: string,
    stateOfTheStage: string,
): string[] {
    const stateOfEachStage = stateOfEachStageInTheCheckpoint(document);
    const lines = STAGES_IN_ORDER.map((name) => {
        const state =
            name === stageChanged
                ? stateOfTheStage
                : (stateOfEachStage.get(name) ?? STAGE_NOT_DONE);
        return `${STAGE_IN_THE_CHECKPOINT}${name}: ${state}`;
    });
    return lines;
}

function withTheCheckpointWritten(document: Document, lines: string[]): Document {
    const source = lines.join("\n");
    const held = document.getCell(UnknownCell, CHECKPOINT);
    const checkpoint =
        held === undefined
            ? new UnknownCell(CHECKPOINT, {}, source)
            : held.withSource(source);
    const others = document.cells.filter(
        (cell) => cell.uniqueId !== checkpoint.uniqueId,
    );
    const documentWithTheCheckpoint = document.withCells([
        ...others,
        checkpoint,
    ]);
    return documentWithTheCheckpoint;
}

function withoutTheCheckpoint(document: Document): Document {
    const checkpoint = document.getCell(UnknownCell, CHECKPOINT);
    const others = document.cells.filter(
        (cell) => cell.uniqueId !== checkpoint?.uniqueId,
    );
    const documentWithoutTheCheckpoint = document.withCells(others);
    return documentWithoutTheCheckpoint;
}

export function storyGenerationOf(
    document: Document,
    progressOfTheStageRunning: StoryGenerationStageJob["progress"] | null,
): StoryGeneration | null {
    const stages = stagesOf(document);
    if (progressOfTheStageRunning !== null) {
        return {
            running: true,
            progress: progressOfTheStageRunning,
            stages,
            asked: null,
        };
    }
    const stageAwaiting = stageAwaitingReview(document);
    if (stageAwaiting !== undefined) {
        const shown = shownInTheCheckpoint(document);
        return {
            running: false,
            progress: { steps: [] },
            stages,
            asked: { stage: stageAwaiting, shown },
        };
    }
    const stagesDone = stages.filter((stage) => stage.done);
    const someStagesDoneAndSomeNot =
        stagesDone.length > 0 && stagesDone.length < stages.length;
    if (!someStagesDoneAndSomeNot) {
        return null;
    }
    return {
        running: false,
        progress: { steps: [] },
        stages,
        asked: null,
    };
}

function showTheFailureToGenerate(failure: unknown): void {
    void vscode.window.showErrorMessage(
        `Cannot generate the story — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
    );
}

export class StoryGenerationWorkflow {
    constructor(private readonly session: AuthorFileEditorSession) {}

    async runTheNextStage(): Promise<void> {
        const stages = stagesOf(this.session.document);
        const nextStage = stages.find((stage) => !stage.done);
        const stageAwaiting = stageAwaitingReview(this.session.document);
        if (nextStage === undefined || stageAwaiting !== undefined) {
            return;
        }
        try {
            await startServerJob("/generate/story", {
                path: this.session.document.path,
                story: this.session.document.text,
                stage: nextStage.name,
            });
        } catch (failure) {
            showTheFailureToGenerate(failure);
            return;
        }
        await this.showWhereItStands();
    }

    async accept(): Promise<void> {
        const stageAwaiting = stageAwaitingReview(this.session.document);
        const suggestionsLeft = this.session.document.suggestions;
        if (stageAwaiting === undefined || suggestionsLeft.length > 0) {
            return;
        }
        const whatTheStageLeavesUndone =
            LEFT_UNDONE_BY_THE_STAGE.get(stageAwaiting);
        const leftUndone =
            whatTheStageLeavesUndone === undefined
                ? null
                : whatTheStageLeavesUndone(this.session.document);
        if (leftUndone !== null) {
            void vscode.window.showErrorMessage(leftUndone);
            return;
        }
        this.session.changeTheDocument((document) => {
            const documentWithTheStageDone = withTheStageIn(
                document,
                stageAwaiting,
                STAGE_DONE,
            );
            return documentWithTheStageDone;
        });
        await this.session.writeTheDocumentToItsFile();
        await this.runTheNextStage();
    }

    async reject(): Promise<void> {
        const stageAwaiting = stageAwaitingReview(this.session.document);
        if (stageAwaiting === undefined) {
            return;
        }
        for (const suggestion of this.session.document.suggestions) {
            this.session.rejectTheSuggestion(suggestion.cellId);
        }
        this.session.changeTheDocument((document) => {
            const documentWithTheStageNotDone = withTheStageIn(
                document,
                stageAwaiting,
                STAGE_NOT_DONE,
            );
            return documentWithTheStageNotDone;
        });
        await this.session.writeTheDocumentToItsFile();
        await this.runTheNextStage();
    }

    async quit(): Promise<void> {
        await this.dropWhatTheStageAsks();
        for (const suggestion of this.session.document.suggestions) {
            this.session.rejectTheSuggestion(suggestion.cellId);
        }
        this.session.changeTheDocument(withoutTheCheckpoint);
        this.session.showNoStageRunning();
        await this.session.writeTheDocumentToItsFile();
    }

    async showWhereItStands(): Promise<void> {
        const path = this.session.uri.fsPath;
        let stageJob: StoryGenerationStageJob;
        try {
            stageJob = await fetchFromServer<StoryGenerationStageJob>(
                `/generate/story/status?id=${encodeURIComponent(path)}`,
            );
        } catch {
            return;
        }
        if (stageJob.running) {
            this.session.showTheStageRunning(stageJob.progress);
            await this.followTheStage(path);
            if (this.session.isShownInItsEditor) {
                await this.showWhereItStands();
            }
            return;
        }
        const asked = stageJob.asked;
        const stageAwaiting = stageAwaitingReview(this.session.document);
        if (asked !== null && stageAwaiting === undefined) {
            const suggestionsMade =
                await this.keepWhatTheStageAsksForReview(asked);
            const nothingToReview =
                asked.shown.kind !== "command" && suggestionsMade === 0;
            if (nothingToReview) {
                await this.accept();
            }
        }
    }

    private async keepWhatTheStageAsksForReview(
        asked: StoryGenerationAsked,
    ): Promise<number> {
        const bytes = await vscode.workspace.fs.readFile(this.session.uri);
        const storyBeforeTheStage = new TextDecoder().decode(bytes);
        const documentBeforeTheStage = new Document(
            storyBeforeTheStage,
            this.session.document.path,
        );
        const documentTheStageLeaves = new Document(
            asked.story,
            this.session.document.path,
        );
        const documentWithTheSuggestions = withTheSuggestionsOfTheStage(
            documentBeforeTheStage,
            documentTheStageLeaves,
        );
        const storyAwaitingReview = withTheStageAwaitingReview(
            documentWithTheSuggestions,
            asked.stage,
            asked.shown,
        );
        this.showWhatTheStageAsks(storyAwaitingReview);
        await this.session.writeTheDocumentToItsFile();
        await this.dropWhatTheStageAsks();
        return storyAwaitingReview.suggestions.length;
    }

    private async followTheStage(path: string): Promise<void> {
        try {
            await awaitServerJob<StoryGenerationStageJob>(
                "/generate/story/status",
                path,
                (stageJob) => this.session.showTheStageRunning(stageJob.progress),
            );
        } catch (failure) {
            showTheFailureToGenerate(failure);
        }
        this.session.showNoStageRunning();
    }

    private async dropWhatTheStageAsks(): Promise<void> {
        try {
            await fetchFromServer("/jobs/cancel", {
                path: this.session.document.path,
            });
        } catch {}
    }

    // Brings what the generation asks into view: the story as a stage leaves it,
    // to review, in the editor, which draws the part of authorship the stage
    // worked in itself.
    private showWhatTheStageAsks(storyAwaitingReview: Document): void {
        const serialized = storyAwaitingReview.serialize();
        this.session.importDocumentFromText(serialized);
    }
}
