import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export const ANSWER_THE_STORY_GENERATION = "answerTheStoryGeneration";

// The author's answer to what the story generation asks, from the main menu: a
// verdict, "accept" or "reject", and the story as the author leaves it.
export class AnswerTheStoryGenerationCommand implements RuntimeCommand {
    constructor(private readonly verdict: string) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AnswerTheStoryGenerationCommand {
        const verdict = serialized.verdict as string;
        const command = new AnswerTheStoryGenerationCommand(verdict);
        return command;
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        if (this.verdict === "accept") {
            await session.storyGenerationWorkflow.accept();
            return;
        }
        await session.storyGenerationWorkflow.reject();
    }
}
