import type { AuthorDocChangeVisitor } from "../author_doc_change_visitor";
import { AuthorDocDiff } from "../diff";
import type { Document } from "../storydoc";
import type { AuthorDocSynchronizer } from "../author_doc_synchronizer";
import type { CellAdded } from "../changes/cell_added";
import type { CellHeaderChanged } from "../changes/cell_header_changed";
import type { CellRemoved } from "../changes/cell_removed";
import type { CellTextChanged } from "../changes/cell_text_changed";
import type { CellsMoved } from "../changes/cells_moved";

export interface SynchronizedRepresentation {
    cellId: string;
    startCharacterOffsetInCell: number;
    endCharacterOffsetInCell: number;
    wordsInTheCell: string;
    isVisible: boolean;
}

function rangeOverlaps(
    startOfTheFirst: number,
    endOfTheFirst: number,
    startOfTheSecond: number,
    endOfTheSecond: number,
): boolean {
    return endOfTheFirst > startOfTheSecond && startOfTheFirst < endOfTheSecond;
}

class CharacterRangesFollowingTheChanges<
    Representation extends SynchronizedRepresentation,
> implements AuthorDocChangeVisitor<void> {
    constructor(
        private readonly before: Document,
        private readonly representations: Representation[],
    ) {}

    visitCellAdded(cellAdded: CellAdded): void {
        const markdownAfter = cellAdded.cell.source;
        for (const repr of this.representations) {
            if (repr.cellId !== cellAdded.cell.uniqueId) {
                continue;
            }
            repr.isVisible =
                markdownAfter.slice(
                    repr.startCharacterOffsetInCell,
                    repr.endCharacterOffsetInCell,
                ) === repr.wordsInTheCell;
        }
    }

    visitCellRemoved(cellRemoved: CellRemoved): void {
        for (const repr of this.representations) {
            if (repr.cellId === cellRemoved.cell.uniqueId) {
                repr.isVisible = false;
            }
        }
    }

    visitCellsMoved(_cellsMoved: CellsMoved): void {}

    visitCellHeaderChanged(_cellHeaderChanged: CellHeaderChanged): void {}

    visitCellTextChanged(cellTextChanged: CellTextChanged): void {
        const cellBefore = this.before.cellWithId(cellTextChanged.cellId);
        const markdownBefore = cellBefore?.source ?? "";
        const markdownAfter = cellTextChanged.textAfter(markdownBefore);
        const theyDifferToCharacterBefore =
            cellTextChanged.fromCharacter + cellTextChanged.textRemoved.length;
        const charactersAdded =
            cellTextChanged.textWritten.length -
            cellTextChanged.textRemoved.length;
        const endOfTheCell = Math.max(
            markdownBefore.length,
            markdownAfter.length,
        );

        for (const repr of this.representations) {
            if (repr.cellId !== cellTextChanged.cellId) {
                continue;
            }

            if (
                rangeOverlaps(
                    cellTextChanged.fromCharacter,
                    endOfTheCell,
                    repr.startCharacterOffsetInCell,
                    repr.endCharacterOffsetInCell,
                ) === false
            ) {
                continue;
            }

            const theChangeEndedBeforeRepr =
                theyDifferToCharacterBefore <= repr.startCharacterOffsetInCell;
            if (theChangeEndedBeforeRepr && repr.isVisible) {
                repr.startCharacterOffsetInCell += charactersAdded;
                repr.endCharacterOffsetInCell += charactersAdded;
            }

            repr.isVisible =
                markdownAfter.slice(
                    repr.startCharacterOffsetInCell,
                    repr.endCharacterOffsetInCell,
                ) === repr.wordsInTheCell;
        }
    }
}

export class CharacterRangeSynchronizer<
    Representation extends SynchronizedRepresentation,
> implements AuthorDocSynchronizer {
    constructor(private readonly representations: Representation[]) {}

    synchronize(before: Document, change: AuthorDocDiff): AuthorDocDiff {
        const followingTheChanges = new CharacterRangesFollowingTheChanges(
            before,
            this.representations,
        );
        for (const cellChange of change.changes) {
            cellChange.accept(followingTheChanges);
        }
        return new AuthorDocDiff([]);
    }
}
