import { AuthorDocument, Cell } from "./model";

export interface AuthorDocCellDiff {
    cellId: string;
    startCharacterIndexInRhsCell: number;
    endCharacterIndexInRhsCell: number;
    startCharacterIndexInLhsCell: number;
    endCharacterIndexInLhsCell: number;
    textInLhs: string; // we assume the change always erases the text in Rhs and inserts text in Lhs
    attributesChanged: Record<string, string | undefined>;
}

function cellOnlyInLhs(cellInLhs: Cell): AuthorDocCellDiff {
    return {
        cellId: cellInLhs.uniqueId,
        startCharacterIndexInRhsCell: 0,
        endCharacterIndexInRhsCell: 0,
        startCharacterIndexInLhsCell: 0,
        endCharacterIndexInLhsCell: cellInLhs.source.length,
        textInLhs: cellInLhs.source,
        attributesChanged: {},
    };
}

function cellOnlyInRhs(cellInRhs: Cell): AuthorDocCellDiff {
    return {
        cellId: cellInRhs.uniqueId,
        startCharacterIndexInRhsCell: 0,
        endCharacterIndexInRhsCell: cellInRhs.source.length,
        startCharacterIndexInLhsCell: 0,
        endCharacterIndexInLhsCell: 0,
        textInLhs: "",
        attributesChanged: { ...cellInRhs.attrs },
    };
}

function attributesChangedBetween(
    cellInLhs: Cell,
    cellInRhs: Cell,
): Record<string, string | undefined> {
    const attributeNames = new Set([
        ...Object.keys(cellInLhs.attrs),
        ...Object.keys(cellInRhs.attrs),
    ]);
    const changed: Record<string, string | undefined> = {};
    for (const attributeName of attributeNames) {
        if (cellInLhs.attrs[attributeName] !== cellInRhs.attrs[attributeName]) {
            changed[attributeName] = cellInRhs.attrs[attributeName];
        }
    }
    return changed;
}

function cellInBoth(
    cellInLhs: Cell,
    cellInRhs: Cell,
): AuthorDocCellDiff | undefined {
    const attributesChanged = attributesChangedBetween(cellInLhs, cellInRhs);
    if (
        cellInLhs.source === cellInRhs.source &&
        Object.keys(attributesChanged).length === 0
    ) {
        return undefined;
    }
    const markdownInLhs = cellInLhs.source;
    const markdownInRhs = cellInRhs.source;

    let charactersSameAtTheStart = 0;
    while (
        charactersSameAtTheStart < markdownInLhs.length &&
        charactersSameAtTheStart < markdownInRhs.length &&
        markdownInLhs[charactersSameAtTheStart] ===
            markdownInRhs[charactersSameAtTheStart]
    ) {
        charactersSameAtTheStart += 1;
    }
    let charactersSameAtTheEnd = 0;
    while (
        charactersSameAtTheEnd <
            markdownInLhs.length - charactersSameAtTheStart &&
        charactersSameAtTheEnd <
            markdownInRhs.length - charactersSameAtTheStart &&
        markdownInLhs[markdownInLhs.length - 1 - charactersSameAtTheEnd] ===
            markdownInRhs[markdownInRhs.length - 1 - charactersSameAtTheEnd]
    ) {
        charactersSameAtTheEnd += 1;
    }

    return {
        cellId: cellInRhs.uniqueId,
        startCharacterIndexInRhsCell: charactersSameAtTheStart,
        endCharacterIndexInRhsCell:
            markdownInRhs.length - charactersSameAtTheEnd,
        startCharacterIndexInLhsCell: charactersSameAtTheStart,
        endCharacterIndexInLhsCell:
            markdownInLhs.length - charactersSameAtTheEnd,
        textInLhs: markdownInLhs.slice(
            charactersSameAtTheStart,
            markdownInLhs.length - charactersSameAtTheEnd,
        ),
        attributesChanged,
    };
}

/**
 * Returns a difference between documents lhs and rhs - what changes would need to be introduced
 * to convert lhs into rhs.
 *
 * @param lhs
 * @param rhs
 * @returns
 */
export function diff(
    lhs: AuthorDocument,
    rhs: AuthorDocument,
): AuthorDocCellDiff[] {
    const differences: AuthorDocCellDiff[] = [];
    for (const cellInLhs of lhs.cells) {
        if (!rhs.cellWithId(cellInLhs.uniqueId)) {
            differences.push(cellOnlyInLhs(cellInLhs));
        }
    }
    for (const cellInRhs of rhs.cells) {
        const cellInLhs = lhs.cellWithId(cellInRhs.uniqueId);
        if (!cellInLhs) {
            differences.push(cellOnlyInRhs(cellInRhs));
            continue;
        }
        const difference = cellInBoth(cellInLhs, cellInRhs);
        if (difference) {
            differences.push(difference);
        }
    }
    return differences;
}
