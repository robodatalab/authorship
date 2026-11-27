import type { StoryGeneration } from "../story_generation/story_generation";
import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";

export const SET_STORY_GENERATION = "setStoryGeneration";

export class SetStoryGenerationWebviewCommand implements WebviewCommand {
    constructor(readonly storyGeneration: StoryGeneration | null) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetStoryGenerationWebviewCommand {
        const storyGeneration =
            serialized.storyGeneration as StoryGeneration | null;
        const command = new SetStoryGenerationWebviewCommand(storyGeneration);
        return command;
    }

    serialize(): Record<string, unknown> {
        return {
            type: SET_STORY_GENERATION,
            storyGeneration: this.storyGeneration,
        };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({ storyGeneration: this.storyGeneration });
        return newState;
    }
}
