import type { AuthorDocChange } from "../author_doc_change";
import type { AuthorDocChangeVisitor } from "../author_doc_change_visitor";
import type { Cell } from "../cells/cell";

export class CellsMoved implements AuthorDocChange {
    constructor(
        readonly cellIdsBefore: readonly string[],
        readonly cellIdsAfter: readonly string[],
    ) {}

    accept<Result>(visitor: AuthorDocChangeVisitor<Result>): Result {
        return visitor.visitCellsMoved(this);
    }

    invert(): CellsMoved {
        return new CellsMoved(this.cellIdsAfter, this.cellIdsBefore);
    }

    applyTo(cells: readonly Cell[]): Cell[] {
        return this.cellIdsAfter.map((cellId) => {
            const cellMoved = cells.find((cell) => cell.uniqueId === cellId);
            if (cellMoved === undefined) {
                throw new Error(`Cell ${cellId} is not there to move`);
            }
            return cellMoved;
        });
    }
}
