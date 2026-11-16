import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import { fetchFromServer } from "../server/fetch";

// The author's answer to what the story generation asks, from the main menu: a
// verdict, "accept" or "stop", and the story as the author leaves it.
export class AnswerTheStoryGenerationCommand implements AuthorDocumentCommand {
    readonly commandName = "answerTheStoryGeneration";
    readonly buttonGroup = "generate";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        try {
            await fetchFromServer("/generate/story/answer", {
                path: session.document.path,
                verdict: commandArguments.verdict as string,
                story: session.document.text,
            });
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot answer the story generation — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        }
    }
}
