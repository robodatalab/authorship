import type { AuthorFileEditorSession } from "../author_file_editor_session";

import type { AuthorDocumentCommand } from "./author_document_command";
import { configuredModel, geminiAccount } from "../gemini/account";
import {
    confirmSendingToGemini,
    sayWhyTheGeminiServerJobStopped,
    type GeminiServerJob,
} from "../gemini/gemini_server_job";
import { awaitServerJob, startServerJob } from "../server/jobs";
import type { SynchronizedRepresentation } from "../storydoc/author_doc_synch";

const STORY_PLOTS_STATUS = "/analyze/plots/status";

export interface StoryPlot {
    title: string;
    summary: string;
}

export interface ParagraphInStoryPlots extends SynchronizedRepresentation {
    storyPlotIndices: number[];
}

interface StoryPlotsJob extends GeminiServerJob {
    storyPlots: StoryPlot[];
    paragraphsInStoryPlots: ParagraphInStoryPlots[];
}

export class IdentifyStoryPlotsCommand implements AuthorDocumentCommand {
    readonly commandName = "identifyStoryPlots";
    readonly buttonGroup = "check";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const apiKey = await geminiAccount()?.require();
        if (!apiKey) {
            return;
        }
        if (!(await confirmSendingToGemini(session))) {
            return;
        }
        let jobId: string | undefined;
        try {
            jobId = await startServerJob("/analyze/plots", {
                path: session.document.uri.fsPath,
                text: session.document.text,
                key: apiKey,
                model: configuredModel(),
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
            await sayWhyTheGeminiServerJobStopped(
                STORY_PLOTS_STATUS,
                jobId,
                failure,
                "identify the plots",
            );
        }
    }
}
