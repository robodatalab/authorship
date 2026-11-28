import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export const GENERATE_STORY = "generateStory";

export class GenerateStoryCommand implements RuntimeCommand {
    static deserialize(): GenerateStoryCommand {
        const command = new GenerateStoryCommand();
        return command;
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        await session.storyGenerationWorkflow.runTheNextStage();
    }
}
