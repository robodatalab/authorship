import { Document } from "./storydoc";
import { markerFor } from "./parser";
import type { AuthorDocChange } from "./author_doc_change";
import type { Cell } from "./cells/cell";
import { CellAdded } from "./changes/cell_added";
import { CellHeaderChanged } from "./changes/cell_header_changed";
import { CellRemoved } from "./changes/cell_removed";
import { CellTextChanged } from "./changes/cell_text_changed";
import { CellsMoved } from "./changes/cells_moved";
import { MarkerAttributes } from "./visitors/marker_attributes";

export class AuthorDocDiff {
    constructor(readonly changes: readonly AuthorDocChange[]) {}

    static diff(lhs: Document, rhs: Document): AuthorDocDiff {
        const changes: AuthorDocChange[] = [];
        const cellIdsInLhs = lhs.cells.map((cell) => cell.uniqueId);
        const cellIdsInRhs = rhs.cells.map((cell) => cell.uniqueId);

        for (let cellIndex = lhs.cells.length - 1; cellIndex >= 0; cellIndex--) {
            const cellInLhs = lhs.cells[cellIndex];
            if (!cellIdsInRhs.includes(cellInLhs.uniqueId)) {
                changes.push(new CellRemoved(cellIndex, cellInLhs));
            }
        }

        const cellIdsBefore = cellIdsInLhs.filter((cellId) =>
            cellIdsInRhs.includes(cellId),
        );
        const cellIdsAfter = cellIdsInRhs.filter((cellId) =>
            cellIdsInLhs.includes(cellId),
        );
        const theyStandInTheSameOrder = cellIdsBefore.every(
            (cellId, standing) => cellId === cellIdsAfter[standing],
        );
        if (!theyStandInTheSameOrder) {
            changes.push(new CellsMoved(cellIdsBefore, cellIdsAfter));
        }

        const markerAttributes = new MarkerAttributes();
        for (const [cellIndex, cellInRhs] of rhs.cells.entries()) {
            const cellInLhs = lhs.cellWithId(cellInRhs.uniqueId);
            if (cellInLhs === undefined) {
                changes.push(new CellAdded(cellIndex, cellInRhs));
                continue;
            }
            const markerInLhs = markerFor(cellInLhs, markerAttributes);
            const markerInRhs = markerFor(cellInRhs, markerAttributes);
            if (markerInLhs !== markerInRhs) {
                const headerBefore = cellInLhs.withSource("");
                const headerAfter = cellInRhs.withSource("");
                changes.push(new CellHeaderChanged(headerBefore, headerAfter));
            }
            if (cellInLhs.source !== cellInRhs.source) {
                const cellTextChanged = CellTextChanged.between(
                    cellInRhs.uniqueId,
                    cellInLhs.source,
                    cellInRhs.source,
                );
                changes.push(cellTextChanged);
            }
        }

        return new AuthorDocDiff(changes);
    }

    empty(): boolean {
        return this.changes.length === 0;
    }

    followedBy(diffsAfterIt: readonly AuthorDocDiff[]): AuthorDocDiff {
        const changesAfterIt = diffsAfterIt.flatMap((diff) => diff.changes);
        return new AuthorDocDiff([...this.changes, ...changesAfterIt]);
    }

    invert(): AuthorDocDiff {
        const changesInReverse = [...this.changes].reverse();
        const inverted = changesInReverse.map((change) => change.invert());
        return new AuthorDocDiff(inverted);
    }

    applyTheDiff(document: Document): Document {
        let cells: readonly Cell[] = document.cells;
        for (const change of this.changes) {
            cells = change.applyTo(cells);
        }
        return Document.fromCells(cells, document.path);
    }
}
