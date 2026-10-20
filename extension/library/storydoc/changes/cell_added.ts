import type { AuthorDocChange } from "../author_doc_change";
import type { AuthorDocChangeVisitor } from "../author_doc_change_visitor";
import type { Cell } from "../cells/cell";
import { CellRemoved } from "./cell_removed";

export class CellAdded implements AuthorDocChange {
    constructor(
        readonly cellIndex: number,
        readonly cell: Cell,
    ) {}

    accept<Result>(visitor: AuthorDocChangeVisitor<Result>): Result {
        return visitor.visitCellAdded(this);
    }

    invert(): CellRemoved {
        return new CellRemoved(this.cellIndex, this.cell);
    }

    applyTo(cells: readonly Cell[]): Cell[] {
        const cellsAbove = cells.slice(0, this.cellIndex);
        const cellsBelow = cells.slice(this.cellIndex);
        return [...cellsAbove, this.cell, ...cellsBelow];
    }
}
