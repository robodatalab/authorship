import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";

export class GenerateStoryCommand implements AuthorDocumentCommand {
    readonly commandName = "generateStory";
    readonly buttonGroup = "generate";
    readonly iconClassName = "codicon codicon-wand";
    readonly tooltip = "Generate the story with you, stage by stage";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        await session.storyGenerationWorkflow.runTheNextStage();
    }
}
