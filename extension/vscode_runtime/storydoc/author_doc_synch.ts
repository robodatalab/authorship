import { AuthorDocDiff } from "./diff";
import type { Document } from "./storydoc";

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

export class AuthorDocSynchronizer<
    Representation extends SynchronizedRepresentation,
> {
    constructor(private readonly representations: Representation[]) {}

    synchronize(docBefore: Document, docAfter: Document): void {
        for (const cellDiff of AuthorDocDiff.diff(docBefore, docAfter).cells) {
            const cellBefore = docBefore.cells.find(
                (cell) => cell.uniqueId === cellDiff.cellId,
            );
            const cellAfter = docAfter.cells.find(
                (cell) => cell.uniqueId === cellDiff.cellId,
            );
            const markdownAfter = cellAfter?.source;
            const charactersAdded =
                cellDiff.textInRhs.length - cellDiff.textInLhs.length;

            for (const repr of this.representations) {
                if (cellDiff.cellId !== repr.cellId) {
                    continue;
                }

                if (markdownAfter === undefined) {
                    repr.isVisible = false;
                    continue;
                }

                const endOfTheCell = Math.max(
                    cellBefore?.source.length ?? 0,
                    cellAfter?.source.length ?? 0,
                );
                if (
                    rangeOverlaps(
                        cellDiff.theyDifferFromCharacter,
                        endOfTheCell,
                        repr.startCharacterOffsetInCell,
                        repr.endCharacterOffsetInCell,
                    ) === false
                ) {
                    continue;
                }

                const theDiffEndedBeforeRepr =
                    cellDiff.theyDifferToCharacterInLhs <=
                    repr.startCharacterOffsetInCell;
                if (theDiffEndedBeforeRepr && repr.isVisible) {
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
}
