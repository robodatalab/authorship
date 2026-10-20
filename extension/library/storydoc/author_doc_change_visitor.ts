import type { CellAdded } from "./changes/cell_added";
import type { CellHeaderChanged } from "./changes/cell_header_changed";
import type { CellRemoved } from "./changes/cell_removed";
import type { CellTextChanged } from "./changes/cell_text_changed";
import type { CellsMoved } from "./changes/cells_moved";

export interface AuthorDocChangeVisitor<Result> {
    visitCellAdded(cellAdded: CellAdded): Result;
    visitCellRemoved(cellRemoved: CellRemoved): Result;
    visitCellsMoved(cellsMoved: CellsMoved): Result;
    visitCellHeaderChanged(cellHeaderChanged: CellHeaderChanged): Result;
    visitCellTextChanged(cellTextChanged: CellTextChanged): Result;
}
