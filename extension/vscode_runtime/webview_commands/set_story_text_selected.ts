import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";

export const SET_STORY_TEXT_SELECTED = "setStoryTextSelected";

export class SetStoryTextSelectedWebviewCommand implements WebviewCommand {
    constructor(readonly storyTextSelected: StoryTextSpan | null) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetStoryTextSelectedWebviewCommand {
        const storyTextSelected =
            serialized.storyTextSelected as StoryTextSpan | null;
        const command = new SetStoryTextSelectedWebviewCommand(
            storyTextSelected,
        );
        return command;
    }

    serialize(): Record<string, unknown> {
        return {
            type: SET_STORY_TEXT_SELECTED,
            storyTextSelected: this.storyTextSelected,
        };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({
            storyTextSelected: this.storyTextSelected,
        });
        return newState;
    }
}
