import * as vscode from "vscode";

import { UnknownCell } from "authordoc/cells/unknown_cell";
import { Document } from "authordoc/storydoc";
import type { AuthorFileEditorSession } from "./author_file_editor_session";
import { fetchFromServer } from "./server/fetch";
import { awaitServerJob, startServerJob } from "./server/jobs";
import type {
    StoryGenerationAsked,
    StoryGenerationShown,
    StoryGenerationStageJob,
    StoryGenerationWorkflowStage,
} from "./story_generation";

const STAGES_IN_ORDER = [
    "concept titles",
    "concepts",
    "characters",
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

const REVIEW_KEPT_FOR = "storyGenerationReview:";

const SHOWN_WITHOUT_THE_REVIEW_KEPT: StoryGenerationShown = { kind: "editor" };

interface StoryGenerationReviewKept {
    shown: StoryGenerationShown;
    storyBeforeTheStage: string;
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
    const stateOfEachStage = stateOfEachStageInTheCheckpoint(document);
    const lines = STAGES_IN_ORDER.map((name) => {
        const state =
            name === stageChanged
                ? stateOfTheStage
                : (stateOfEachStage.get(name) ?? STAGE_NOT_DONE);
        return `${STAGE_IN_THE_CHECKPOINT}${name}: ${state}`;
    });
    const source = lines.join("\n");
    const held = document.getCell(UnknownCell, CHECKPOINT);
    const checkpoint =
        held === undefined
            ? new UnknownCell(CHECKPOINT, {}, source)
            : held.withSource(source);
    const others = document.cells.filter(
        (cell) => cell.uniqueId !== checkpoint.uniqueId,
    );
    const documentWithTheStageChanged = document.withCells([
        ...others,
        checkpoint,
    ]);
    return documentWithTheStageChanged;
}

function withoutTheCheckpoint(document: Document): Document {
    const checkpoint = document.getCell(UnknownCell, CHECKPOINT);
    const others = document.cells.filter(
        (cell) => cell.uniqueId !== checkpoint?.uniqueId,
    );
    const documentWithoutTheCheckpoint = document.withCells(others);
    return documentWithoutTheCheckpoint;
}

function showTheFailureToGenerate(failure: unknown): void {
    void vscode.window.showErrorMessage(
        `Cannot generate the story — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
    );
}

export class StoryGenerationWorkflow {
    constructor(
        private readonly session: AuthorFileEditorSession,
        private readonly workspaceState: vscode.Memento,
    ) {}

    async runTheNextStage(): Promise<void> {
        const stages = stagesOf(this.session.document);
        const nextStage = stages.find((stage) => !stage.done);
        if (nextStage === undefined) {
            this.session.showTheStoryGeneration(null);
            return;
        }
        const stageAwaiting = stageAwaitingReview(this.session.document);
        if (stageAwaiting !== undefined) {
            this.showWhereItLeftOff();
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
        if (stageAwaiting === undefined) {
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
        await this.workspaceState.update(this.keyOfTheReviewKept, undefined);
        await this.runTheNextStage();
    }

    async reject(): Promise<void> {
        const reviewKept = this.reviewKept();
        if (reviewKept === undefined) {
            void vscode.window.showErrorMessage(
                "The story as it was before this stage is not kept in this workspace: accept it, or quit the generation.",
            );
            return;
        }
        this.session.importDocumentFromText(reviewKept.storyBeforeTheStage);
        await this.session.writeTheDocumentToItsFile();
        await this.workspaceState.update(this.keyOfTheReviewKept, undefined);
        this.showWhereItLeftOff();
    }

    async quit(): Promise<void> {
        await this.dropWhatTheStageAsks();
        const reviewKept = this.reviewKept();
        if (reviewKept !== undefined) {
            this.session.importDocumentFromText(
                reviewKept.storyBeforeTheStage,
            );
        }
        this.session.changeTheDocument(withoutTheCheckpoint);
        await this.session.writeTheDocumentToItsFile();
        await this.workspaceState.update(this.keyOfTheReviewKept, undefined);
        this.session.showTheStoryGeneration(null);
    }

    async showWhereItStands(): Promise<void> {
        const path = this.session.uri.fsPath;
        let stageJob: StoryGenerationStageJob;
        try {
            stageJob = await fetchFromServer<StoryGenerationStageJob>(
                `/generate/story/status?id=${encodeURIComponent(path)}`,
            );
        } catch {
            this.showWhereItLeftOff();
            return;
        }
        if (stageJob.running) {
            await this.followTheStage(path);
            if (this.session.isShownInItsEditor) {
                await this.showWhereItStands();
            }
            return;
        }
        const asked = stageJob.asked;
        const stageAwaiting = stageAwaitingReview(this.session.document);
        if (asked !== null && stageAwaiting === undefined) {
            await this.keepWhatTheStageAsksForReview(asked);
        }
        this.showWhereItLeftOff();
    }

    private get keyOfTheReviewKept(): string {
        return `${REVIEW_KEPT_FOR}${this.session.uri.toString()}`;
    }

    private reviewKept(): StoryGenerationReviewKept | undefined {
        const stageAwaiting = stageAwaitingReview(this.session.document);
        if (stageAwaiting === undefined) {
            return undefined;
        }
        const reviewKept = this.workspaceState.get<StoryGenerationReviewKept>(
            this.keyOfTheReviewKept,
        );
        return reviewKept;
    }

    private async keepWhatTheStageAsksForReview(
        asked: StoryGenerationAsked,
    ): Promise<void> {
        const bytes = await vscode.workspace.fs.readFile(this.session.uri);
        const storyBeforeTheStage = new TextDecoder().decode(bytes);
        const reviewKept: StoryGenerationReviewKept = {
            shown: asked.shown,
            storyBeforeTheStage,
        };
        await this.workspaceState.update(this.keyOfTheReviewKept, reviewKept);
        this.showWhatTheStageAsks(asked);
        await this.session.writeTheDocumentToItsFile();
        await this.dropWhatTheStageAsks();
    }

    private async followTheStage(path: string): Promise<void> {
        try {
            await awaitServerJob<StoryGenerationStageJob>(
                "/generate/story/status",
                path,
                (stageJob) => this.showTheStageJob(stageJob),
            );
        } catch (failure) {
            showTheFailureToGenerate(failure);
        }
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
    private showWhatTheStageAsks(asked: StoryGenerationAsked): void {
        const storyTheStageLeaves = new Document(
            asked.story,
            this.session.document.path,
        );
        const storyAwaitingReview = withTheStageIn(
            storyTheStageLeaves,
            asked.stage,
            STAGE_AWAITING_REVIEW,
        );
        this.session.importDocumentFromText(storyAwaitingReview.text);
    }

    private showTheStageJob(stageJob: StoryGenerationStageJob): void {
        const stages = stagesOf(this.session.document);
        this.session.showTheStoryGeneration({ ...stageJob, stages });
    }

    private showWhereItLeftOff(): void {
        const stages = stagesOf(this.session.document);
        const stageAwaiting = stageAwaitingReview(this.session.document);
        if (stageAwaiting !== undefined) {
            const reviewKept = this.reviewKept();
            const shown = reviewKept?.shown ?? SHOWN_WITHOUT_THE_REVIEW_KEPT;
            this.session.showTheStoryGeneration({
                running: false,
                error: null,
                progress: { steps: [] },
                stages,
                asked: {
                    stage: stageAwaiting,
                    story: this.session.document.text,
                    shown,
                },
            });
            return;
        }
        const stagesDone = stages.filter((stage) => stage.done);
        const someStagesDoneAndSomeNot =
            stagesDone.length > 0 && stagesDone.length < stages.length;
        if (!someStagesDoneAndSomeNot) {
            this.session.showTheStoryGeneration(null);
            return;
        }
        this.session.showTheStoryGeneration({
            running: false,
            error: null,
            progress: { steps: [] },
            stages,
            asked: null,
        });
    }
}
