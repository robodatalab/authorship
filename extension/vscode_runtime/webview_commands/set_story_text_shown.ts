import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";

export const SET_STORY_TEXT_SHOWN = "setStoryTextShown";

export class SetStoryTextShownWebviewCommand implements WebviewCommand {
    constructor(readonly storyTextShown: StoryTextSpan) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetStoryTextShownWebviewCommand {
        const storyTextShown = serialized.storyTextShown as StoryTextSpan;
        const command = new SetStoryTextShownWebviewCommand(storyTextShown);
        return command;
    }

    serialize(): Record<string, unknown> {
        return {
            type: SET_STORY_TEXT_SHOWN,
            storyTextShown: this.storyTextShown,
        };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({ storyTextShown: this.storyTextShown });
        return newState;
    }
}
