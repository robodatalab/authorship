import type { AuthorDocChange } from "../author_doc_change";
import type { AuthorDocChangeVisitor } from "../author_doc_change_visitor";
import type { Cell } from "../cells/cell";
import { CellAdded } from "./cell_added";

export class CellRemoved implements AuthorDocChange {
    constructor(
        readonly cellIndex: number,
        readonly cell: Cell,
    ) {}

    accept<Result>(visitor: AuthorDocChangeVisitor<Result>): Result {
        return visitor.visitCellRemoved(this);
    }

    invert(): CellAdded {
        return new CellAdded(this.cellIndex, this.cell);
    }

    applyTo(cells: readonly Cell[]): Cell[] {
        const cellsAbove = cells.slice(0, this.cellIndex);
        const cellsBelow = cells.slice(this.cellIndex + 1);
        return [...cellsAbove, ...cellsBelow];
    }
}
