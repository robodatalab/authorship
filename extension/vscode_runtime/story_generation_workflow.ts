import * as vscode from "vscode";

import { UnknownCell } from "authordoc/cells/unknown_cell";
import type { Document } from "authordoc/storydoc";
import type { AuthorFileEditorSession } from "./author_file_editor_session";
import { fetchFromServer } from "./server/fetch";
import { awaitServerJob, startServerJob } from "./server/jobs";
import type {
    StoryGenerationAsked,
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

const STAGE_NOT_DONE = "False";

function stagesDoneInTheCheckpoint(document: Document): Set<string> {
    const checkpoint = document.getCell(UnknownCell, CHECKPOINT);
    const lines = checkpoint?.source.split("\n") ?? [];
    const stagesDone = new Set<string>();
    for (const line of lines) {
        if (!line.startsWith(STAGE_IN_THE_CHECKPOINT)) {
            continue;
        }
        const written = line.slice(STAGE_IN_THE_CHECKPOINT.length);
        const doneAt = written.lastIndexOf(": ");
        const stage = written.slice(0, doneAt);
        const done = written.slice(doneAt + 2);
        if (done === STAGE_DONE) {
            stagesDone.add(stage);
        }
    }
    return stagesDone;
}

function stagesOf(document: Document): StoryGenerationWorkflowStage[] {
    const stagesDone = stagesDoneInTheCheckpoint(document);
    const stages = STAGES_IN_ORDER.map((name) => {
        const done = stagesDone.has(name);
        return { name, done };
    });
    return stages;
}

function withTheStageDone(document: Document, stageDone: string): Document {
    const stages = stagesOf(document);
    const lines = stages.map((stage) => {
        const done =
            stage.done || stage.name === stageDone
                ? STAGE_DONE
                : STAGE_NOT_DONE;
        return `${STAGE_IN_THE_CHECKPOINT}${stage.name}: ${done}`;
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
    const documentWithTheStageDone = document.withCells([
        ...others,
        checkpoint,
    ]);
    return documentWithTheStageDone;
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
        if (nextStage === undefined) {
            this.session.showTheStoryGeneration(null);
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
        const asked = this.session.theStoryGeneration?.asked ?? null;
        if (asked === null) {
            return;
        }
        await this.dropWhatTheStageAsks();
        this.session.changeTheDocument((document) => {
            const documentWithTheStageDone = withTheStageDone(
                document,
                asked.stage,
            );
            return documentWithTheStageDone;
        });
        await this.session.writeTheDocumentToItsFile();
        await this.runTheNextStage();
    }

    async stop(): Promise<void> {
        await this.dropWhatTheStageAsks();
        await this.session.readTheDocumentBackFromItsFile();
        await this.showWhereItStands();
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
        if (asked === null) {
            this.showWhereItLeftOff();
            return;
        }
        this.showWhatTheStageAsks(asked);
        this.showTheStageJob(stageJob);
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
        this.session.importDocumentFromText(asked.story);
    }

    private showTheStageJob(stageJob: StoryGenerationStageJob): void {
        const stages = stagesOf(this.session.document);
        this.session.showTheStoryGeneration({ ...stageJob, stages });
    }

    private showWhereItLeftOff(): void {
        const stages = stagesOf(this.session.document);
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
