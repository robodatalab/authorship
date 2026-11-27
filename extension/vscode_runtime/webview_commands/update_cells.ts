import type { WebviewCommand } from "./webview_command";
import type { WebviewRenderState } from "./webview_render_state";
import type { Cell } from "authordoc/cells/cell";
import { parse, serialize } from "authordoc/parser";

export const UPDATE_CELLS = "updateCells";

export class UpdateCellsWebviewCommand implements WebviewCommand {
    constructor(
        readonly cells: readonly Cell[],
        readonly cellsThePageTyped: readonly Cell[],
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): UpdateCellsWebviewCommand {
        const written = serialized.cells as string[];
        const cells = written.flatMap((writtenCell) => parse(writtenCell));
        const typed = serialized.cellsThePageTyped as string[];
        const cellsThePageTyped = typed.flatMap((typedCell) =>
            parse(typedCell),
        );
        const command = new UpdateCellsWebviewCommand(cells, cellsThePageTyped);
        return command;
    }

    serialize(): Record<string, unknown> {
        const cells = this.cells.map((cell) => serialize([cell], []));
        const cellsThePageTyped = this.cellsThePageTyped.map((cell) =>
            serialize([cell], []),
        );
        return { type: UPDATE_CELLS, cells, cellsThePageTyped };
    }

    integrate(state: WebviewRenderState): WebviewRenderState {
        const timesTheHostWroteEachCell = state.incrementCellRevisions(
            this.cells,
        );
        const cells = state.cells.map(
            (cellBefore) =>
                this.cells.find(
                    (cell) => cell.uniqueId === cellBefore.uniqueId,
                ) ??
                this.cellsThePageTyped.find(
                    (cell) => cell.uniqueId === cellBefore.uniqueId,
                ) ??
                cellBefore,
        );
        const newState = state.with({ cells, timesTheHostWroteEachCell });
        return newState;
    }
}
