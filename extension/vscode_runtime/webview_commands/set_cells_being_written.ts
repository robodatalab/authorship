import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";

export const SET_CELLS_BEING_WRITTEN = "setCellsBeingWritten";

export class SetCellsBeingWrittenWebviewCommand implements WebviewCommand {
    constructor(readonly cellsBeingWritten: Record<string, number>) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetCellsBeingWrittenWebviewCommand {
        const cellsBeingWritten = serialized.cellsBeingWritten as Record<
            string,
            number
        >;
        const command = new SetCellsBeingWrittenWebviewCommand(
            cellsBeingWritten,
        );
        return command;
    }

    serialize(): Record<string, unknown> {
        return {
            type: SET_CELLS_BEING_WRITTEN,
            cellsBeingWritten: this.cellsBeingWritten,
        };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const newState = state.with({
            cellsBeingWritten: this.cellsBeingWritten,
        });
        return newState;
    }
}
