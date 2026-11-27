import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";
import { parseSuggestions, serialize } from "authordoc/parser";
import type { Suggestion } from "authordoc/suggestion";

export const SET_SUGGESTIONS = "setSuggestions";

export class SetSuggestionsWebviewCommand implements WebviewCommand {
    constructor(readonly suggestions: readonly Suggestion[]) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetSuggestionsWebviewCommand {
        const written = serialized.suggestions as string;
        const suggestions = parseSuggestions(written);
        const command = new SetSuggestionsWebviewCommand(suggestions);
        return command;
    }

    serialize(): Record<string, unknown> {
        const suggestions = serialize([], this.suggestions);
        return { type: SET_SUGGESTIONS, suggestions };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({ suggestions: [...this.suggestions] });
        return newState;
    }
}
