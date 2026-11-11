import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob } from "../server/jobs";
import type {
    StoryGeneration,
    StoryGenerationAsked,
} from "../story_generation";

// Opens the Authorship panel in the sidebar: VS Code gives every view a command
// that focuses it.
const OPEN_THE_AUTHORSHIP_PANEL = "authorship.manuscript.focus";

// Brings what the generation asks into view: the story as a stage leaves it,
// to review, in the editor, and the part of authorship the stage worked in. A
// tab, or a command in it, is shown in the Authorship panel, which is opened on
// it and draws its own part of it.
function showWhatTheStoryGenerationAsks(
    session: AuthorFileEditorSession,
    asked: StoryGenerationAsked,
): void {
    session.importDocumentFromText(asked.story);
    if (asked.shown.kind !== "editor") {
        void vscode.commands.executeCommand(OPEN_THE_AUTHORSHIP_PANEL);
    }
}

export class GenerateStoryCommand implements AuthorDocumentCommand {
    readonly commandName = "generateStory";
    readonly buttonGroup = "generate";
    readonly iconClassName = "codicon codicon-wand";
    readonly tooltip = "Generate the story with you, stage by stage";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        // The question last brought into view: every one is acted on once,
        // however many times the job is polled while it waits for the author.
        let numberShown = 0;
        try {
            await session.writeTheDocumentToItsFile();
            const jobId = await startServerJob("/generate/story", {
                path: session.document.path,
            });
            await awaitServerJob<StoryGeneration>(
                "/generate/story/status",
                jobId,
                (storyGeneration) => {
                    const asked = storyGeneration.asked;
                    if (asked !== null && asked.number !== numberShown) {
                        numberShown = asked.number;
                        showWhatTheStoryGenerationAsks(session, asked);
                    }
                    session.showTheStoryGeneration(storyGeneration);
                },
            );
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot generate the story — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        } finally {
            session.showTheStoryGeneration(null);
            // A story shown for review and not accepted gives way to the story
            // as the generation saved it.
            await session.readTheDocumentBackFromItsFile();
        }
    }
}
