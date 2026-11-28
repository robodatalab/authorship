import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

const QUIT_THE_GENERATION = "Quit the Generation";

export const QUIT_THE_STORY_GENERATION = "quitTheStoryGeneration";

export class QuitTheStoryGenerationCommand implements RuntimeCommand {
    static deserialize(): QuitTheStoryGenerationCommand {
        const command = new QuitTheStoryGenerationCommand();
        return command;
    }

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
