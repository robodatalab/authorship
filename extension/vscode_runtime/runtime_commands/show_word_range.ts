import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";
import { StoryWordRange } from "authordoc/cells/story_word_range";

export const SHOW_WORD_RANGE = "showStoryWordRange";

export class ShowWordRangeCommand implements RuntimeCommand {
    constructor(private readonly storyWordRange: StoryWordRange) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): ShowWordRangeCommand {
        const firstWord = serialized.firstWord as number;
        const lastWord = serialized.lastWord as number;
        const storyWordRange = new StoryWordRange(firstWord, lastWord);
        const command = new ShowWordRangeCommand(storyWordRange);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.showTheStoryWordRange(this.storyWordRange);
    }
}
