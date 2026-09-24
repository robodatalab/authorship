import type { AuthorFileEditorSession } from "../author_file_editor_session";

import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import {
    awaitServerJob,
    startServerJob,
    type ServerJob,
    type WorkProgress,
} from "../server/jobs";
import type { SynchronizedRepresentation } from "../storydoc/author_doc_synch";

const STORY_PLOTS_STATUS = "/analyze/plots/status";

export interface StoryPlot {
    title: string;
    characters: string[];
    origin: string;
    goal: string;
    keyEvents: string[];
}

export interface ParagraphInStoryPlots extends SynchronizedRepresentation {
    storyPlotIndices: number[];
}

const NOTHING_DONE_YET: WorkProgress = {
    doing: "identify plots",
    done: 0,
    of: null,
    seconds: 0,
    state: "waiting",
    steps: [],
};

interface StoryPlotsJob extends ServerJob {
    storyPlots: StoryPlot[];
    paragraphsInStoryPlots: ParagraphInStoryPlots[];
    progress: WorkProgress;
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
            session.identifyingStoryPlots(NOTHING_DONE_YET);
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
