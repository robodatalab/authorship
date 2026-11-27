import type { StoryAnnotationSelected } from "../story_annotation_selection";
import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";

export const SET_STORY_ANNOTATIONS_SELECTED = "setStoryAnnotationsSelected";

export class SetStoryAnnotationsSelectedWebviewCommand implements WebviewCommand {
    constructor(
        readonly storyAnnotationsSelected: Record<
            string,
            StoryAnnotationSelected
        >,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetStoryAnnotationsSelectedWebviewCommand {
        const storyAnnotationsSelected =
            serialized.storyAnnotationsSelected as Record<
                string,
                StoryAnnotationSelected
            >;
        const command = new SetStoryAnnotationsSelectedWebviewCommand(
            storyAnnotationsSelected,
        );
        return command;
    }

    serialize(): Record<string, unknown> {
        return {
            type: SET_STORY_ANNOTATIONS_SELECTED,
            storyAnnotationsSelected: this.storyAnnotationsSelected,
        };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({
            storyAnnotationsSelected: this.storyAnnotationsSelected,
        });
        return newState;
    }
}
