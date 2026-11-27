import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";

const QUIT_THE_GENERATION = "Quit the Generation";

export class QuitTheStoryGenerationCommand implements AuthorDocumentCommand {
    readonly commandName = "quitTheStoryGeneration";
    readonly buttonGroup = "generate";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const answer = await vscode.window.showWarningMessage(
            "Quit the story generation altogether?",
            {
                modal: true,
                detail: "The story keeps what the stages accepted so far; the record of the stages done is removed, and a stage waiting for your review is dropped.",
            },
            QUIT_THE_GENERATION,
        );
        if (answer !== QUIT_THE_GENERATION) {
            return;
        }
        await session.storyGenerationWorkflow.quit();
    }
}
