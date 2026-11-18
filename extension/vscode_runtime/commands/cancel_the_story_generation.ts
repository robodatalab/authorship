import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";

const CANCEL_THE_GENERATION = "Cancel the Generation";

export class CancelTheStoryGenerationCommand implements AuthorDocumentCommand {
    readonly commandName = "cancelTheStoryGeneration";
    readonly buttonGroup = "generate";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const answer = await vscode.window.showWarningMessage(
            "Cancel the story generation altogether?",
            {
                modal: true,
                detail: "The story keeps what the stages accepted so far; the record of the stages done is removed, and a stage waiting for your review is dropped.",
            },
            CANCEL_THE_GENERATION,
        );
        if (answer !== CANCEL_THE_GENERATION) {
            return;
        }
        await session.storyGenerationWorkflow.cancel();
    }
}
