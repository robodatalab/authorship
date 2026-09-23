import type { AuthorFileEditorSession } from "../author_file_editor_session";

import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import type { SynchronizedRepresentation } from "../storydoc/author_doc_synch";

const STORY_PLOTS_STATUS = "/analyze/plots/status";

export interface StoryPlot {
    title: string;
    summary: string;
}

export interface ParagraphInStoryPlots extends SynchronizedRepresentation {
    storyPlotIndices: number[];
}

export interface StoryPlotsStep {
    passes: number;
    doing: "plots" | "paragraphs" | "events";
    done: number;
    of: number;
    seconds: number;
    state: "waiting" | "running" | "done";
}

const NOTHING_READ_YET: StoryPlotsStep[] = [];

interface StoryPlotsJob extends ServerJob {
    storyPlots: StoryPlot[];
    paragraphsInStoryPlots: ParagraphInStoryPlots[];
    progress: StoryPlotsStep[];
}

export class IdentifyStoryPlotsCommand implements AuthorDocumentCommand {
    readonly commandName = "identifyStoryPlots";
    readonly buttonGroup = "check";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        try {
            const jobId = await startServerJob("/analyze/plots", {
                path: session.document.uri.fsPath,
                text: session.document.text,
            });
            session.identifyingStoryPlots(NOTHING_READ_YET);
            const identified = await awaitServerJob<StoryPlotsJob>(
                STORY_PLOTS_STATUS,
                jobId,
                (running) => {
                    session.identifyingStoryPlots(running.progress);
                    session.showStoryPlots(
                        running.storyPlots,
                        running.paragraphsInStoryPlots,
                    );
                },
            );
            session.showStoryPlots(
                identified.storyPlots,
                identified.paragraphsInStoryPlots,
            );
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot identify the plots — ${failure instanceof Error ? failure.message : String(failure)}`,
            );
        } finally {
            session.identifyingStoryPlots(null);
        }
    }
}
