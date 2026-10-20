import type { AuthorDocChange } from "../author_doc_change";
import type { AuthorDocChangeVisitor } from "../author_doc_change_visitor";
import type { Cell } from "../cells/cell";

export class CellHeaderChanged implements AuthorDocChange {
    constructor(
        readonly headerBefore: Cell,
        readonly headerAfter: Cell,
    ) {}

    accept<Result>(visitor: AuthorDocChangeVisitor<Result>): Result {
        return visitor.visitCellHeaderChanged(this);
    }

    invert(): CellHeaderChanged {
        return new CellHeaderChanged(this.headerAfter, this.headerBefore);
    }

    applyTo(cells: readonly Cell[]): Cell[] {
        return cells.map((cell) =>
            cell.uniqueId === this.headerAfter.uniqueId
                ? this.headerAfter.withSource(cell.source)
                : cell,
        );
    }
}
