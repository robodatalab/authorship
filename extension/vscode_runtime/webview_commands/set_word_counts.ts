import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";

export const SET_WORD_COUNTS = "setWordCounts";

export class SetWordCountsWebviewCommand implements WebviewCommand {
    constructor(
        readonly wordsInEverySection: Record<string, number>,
        readonly wordsInTheDocument: number,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetWordCountsWebviewCommand {
        const wordsInEverySection = serialized.wordsInEverySection as Record<
            string,
            number
        >;
        const wordsInTheDocument = serialized.wordsInTheDocument as number;
        const command = new SetWordCountsWebviewCommand(
            wordsInEverySection,
            wordsInTheDocument,
        );
        return command;
    }

    serialize(): Record<string, unknown> {
        return {
            type: SET_WORD_COUNTS,
            wordsInEverySection: this.wordsInEverySection,
            wordsInTheDocument: this.wordsInTheDocument,
        };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({
            wordsInEverySection: this.wordsInEverySection,
            wordsInTheDocument: this.wordsInTheDocument,
        });
        return newState;
    }
}
