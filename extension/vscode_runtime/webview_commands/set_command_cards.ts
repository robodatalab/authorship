import type { WebviewAuthorDocumentCommandCard } from "../../webview/author_editor/AuthorFileEditorCanvas";
import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";

export const SET_COMMAND_CARDS = "setCommandCards";

export class SetCommandCardsWebviewCommand implements WebviewCommand {
    constructor(readonly commands: WebviewAuthorDocumentCommandCard[]) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetCommandCardsWebviewCommand {
        const commands =
            serialized.commands as WebviewAuthorDocumentCommandCard[];
        const command = new SetCommandCardsWebviewCommand(commands);
        return command;
    }

    serialize(): Record<string, unknown> {
        return { type: SET_COMMAND_CARDS, commands: this.commands };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({ commands: this.commands });
        return newState;
    }
}
