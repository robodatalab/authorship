import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";
import type { Cell } from "authordoc/cells/cell";
import { parse, serialize } from "authordoc/parser";

export const SET_ALL_CELLS = "setAllCells";

export class SetAllCellsWebviewCommand implements WebviewCommand {
    constructor(readonly cells: readonly Cell[]) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): SetAllCellsWebviewCommand {
        const written = serialized.cells as string[];
        const cells = written.flatMap((writtenCell) => parse(writtenCell));
        const command = new SetAllCellsWebviewCommand(cells);
        return command;
    }

    serialize(): Record<string, unknown> {
        const cells = this.cells.map((cell) => serialize([cell], []));
        return { type: SET_ALL_CELLS, cells };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const timesTheHostWroteEachCell = state.incrementCellRevisions(
            this.cells,
        );
        const newState = state.with({
            cells: [...this.cells],
            timesTheHostWroteEachCell,
        });
        return newState;
    }
}
