import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import type { SynchronizedRepresentation } from "../storydoc/author_doc_synch";

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
    readonly buttonGroup = "analysis";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        try {
            const jobId = await startServerJob("/analyze/plots", {
                path: session.document.uri.fsPath,
                text: session.document.text,
            });
            const identified = await awaitServerJob<StoryPlotsJob>(
                "/analyze/plots/status",
                jobId,
            );
            session.showStoryPlots(
                identified.storyPlots,
                identified.paragraphsInStoryPlots,
            );
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot identify the plots — is the model server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        }
    }
}
