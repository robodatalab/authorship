import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";

// The author's answer to what the story generation asks, from the main menu: a
// verdict, "accept", "reject" or "restart", and the story as the author leaves it.
export class AnswerTheStoryGenerationCommand implements AuthorDocumentCommand {
    readonly commandName = "answerTheStoryGeneration";
    readonly buttonGroup = "generate";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        if (commandArguments.verdict === "accept") {
            await session.storyGenerationWorkflow.accept();
            return;
        }
        if (commandArguments.verdict === "restart") {
            await session.storyGenerationWorkflow.restart();
            return;
        }
        await session.storyGenerationWorkflow.reject();
    }
}
