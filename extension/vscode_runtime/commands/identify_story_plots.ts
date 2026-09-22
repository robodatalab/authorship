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

interface StoryPlotsJob extends ServerJob {
    storyPlots: StoryPlot[];
    paragraphsInStoryPlots: ParagraphInStoryPlots[];
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
            const identified = await awaitServerJob<StoryPlotsJob>(
                STORY_PLOTS_STATUS,
                jobId,
                (sofar) =>
                    session.showStoryPlots(
                        sofar.storyPlots,
                        sofar.paragraphsInStoryPlots,
                    ),
            );
            session.showStoryPlots(
                identified.storyPlots,
                identified.paragraphsInStoryPlots,
            );
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot identify the plots — ${failure instanceof Error ? failure.message : String(failure)}`,
            );
        }
    }
}
