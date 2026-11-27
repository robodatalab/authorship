import type { AuthorFileEditorFindMatch } from "../runtime_commands/find_in_the_document";
import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";

export const SET_FIND_MATCHES = "setFindMatches";

export class SetFindMatchesWebviewCommand implements WebviewCommand {
    constructor(readonly findMatches: AuthorFileEditorFindMatch[]) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetFindMatchesWebviewCommand {
        const findMatches =
            serialized.findMatches as AuthorFileEditorFindMatch[];
        const command = new SetFindMatchesWebviewCommand(findMatches);
        return command;
    }

    serialize(): Record<string, unknown> {
        return { type: SET_FIND_MATCHES, findMatches: this.findMatches };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({ findMatches: this.findMatches });
        return newState;
    }
}
