import type { AuthorDocDiff } from "../diff";
import type { Document } from "../storydoc";
import type { AuthorDocSynchronizer } from "./author_doc_synchronizer";
import type { SynchronizedRepresentation } from "./synchronized_representation";

function rangeOverlaps(
    startOfTheFirst: number,
    endOfTheFirst: number,
    startOfTheSecond: number,
    endOfTheSecond: number,
): boolean {
    return endOfTheFirst > startOfTheSecond && startOfTheFirst < endOfTheSecond;
}

export class CharacterRangeSynchronizer<
    Representation extends SynchronizedRepresentation,
> implements AuthorDocSynchronizer {
    constructor(private readonly representations: Representation[]) {}

    synchronize(before: Document, change: AuthorDocDiff): void {
        for (const cellDiff of change.cells) {
            const cellBefore = before.cellWithId(cellDiff.cellId);
            const markdownBefore = cellBefore?.source ?? "";
            const markdownAfter =
                cellDiff.headerInRhs === undefined
                    ? undefined
                    : cellDiff.sourceInRhs(markdownBefore);
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
                    markdownBefore.length,
                    markdownAfter.length,
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
