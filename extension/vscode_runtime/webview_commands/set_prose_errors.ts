import type { ProseCheckError } from "../runtime_commands/check_prose";
import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";

export const SET_PROSE_ERRORS = "setProseErrors";

export class SetProseErrorsWebviewCommand implements WebviewCommand {
    constructor(readonly proseErrors: ProseCheckError[]) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetProseErrorsWebviewCommand {
        const proseErrors = serialized.proseErrors as ProseCheckError[];
        const command = new SetProseErrorsWebviewCommand(proseErrors);
        return command;
    }

    serialize(): Record<string, unknown> {
        return { type: SET_PROSE_ERRORS, proseErrors: this.proseErrors };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({ proseErrors: this.proseErrors });
        return newState;
    }
}
