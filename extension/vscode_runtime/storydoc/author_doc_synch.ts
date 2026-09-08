import { diff } from "./diff";
import type { AuthorDocument } from "./model";

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

    synchronize(docBefore: AuthorDocument, docAfter: AuthorDocument): void {
        for (const cellDiff of diff(docBefore, docAfter)) {
            const markdownAfter = docAfter.cellWithId(cellDiff.cellId)?.source;
            const charactersAdded =
                cellDiff.endCharacterIndexInRhsCell -
                cellDiff.startCharacterIndexInRhsCell -
                (cellDiff.endCharacterIndexInLhsCell -
                    cellDiff.startCharacterIndexInLhsCell);

            for (const repr of this.representations) {
                if (cellDiff.cellId !== repr.cellId) {
                    continue;
                }

                if (markdownAfter === undefined) {
                    repr.isVisible = false;
                    continue;
                }

                const endOfTheCell = Math.max(
                    docBefore.numCharactersInCell(cellDiff.cellId),
                    docAfter.numCharactersInCell(cellDiff.cellId),
                );
                if (
                    rangeOverlaps(
                        cellDiff.startCharacterIndexInLhsCell,
                        endOfTheCell,
                        repr.startCharacterOffsetInCell,
                        repr.endCharacterOffsetInCell,
                    ) === false
                ) {
                    continue;
                }

                const theDiffEndedBeforeRepr =
                    cellDiff.endCharacterIndexInLhsCell <=
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
