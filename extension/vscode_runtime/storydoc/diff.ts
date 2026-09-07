import { AuthorDocument, Cell } from "./model";

export interface AuthorDocCellDiff {
    cellId: string;
    cellIsInRhs: boolean;
    atCellIndexInRhs: number;
    editedFromOffsetInCell: number;
    charactersRemoved: number;
    insertedText: string;
    attributesChanged: Record<string, string | undefined>;
}

function cellOnlyInLhs(cellInLhs: Cell): AuthorDocCellDiff {
    return {
        cellId: cellInLhs.uniqueId,
        cellIsInRhs: false,
        atCellIndexInRhs: -1,
        editedFromOffsetInCell: 0,
        charactersRemoved: 0,
        insertedText: "",
        attributesChanged: {},
    };
}

function cellOnlyInRhs(
    cellInRhs: Cell,
    atCellIndexInRhs: number,
): AuthorDocCellDiff {
    return {
        cellId: cellInRhs.uniqueId,
        cellIsInRhs: true,
        atCellIndexInRhs,
        editedFromOffsetInCell: 0,
        charactersRemoved: 0,
        insertedText: cellInRhs.source,
        attributesChanged: { ...cellInRhs.attrs },
    };
}

function markdownEditBetween(
    markdownInLhs: string,
    markdownInRhs: string,
): Pick<
    AuthorDocCellDiff,
    "editedFromOffsetInCell" | "charactersRemoved" | "insertedText"
> {
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
        editedFromOffsetInCell: charactersSameAtTheStart,
        charactersRemoved:
            markdownInLhs.length -
            charactersSameAtTheStart -
            charactersSameAtTheEnd,
        insertedText: markdownInRhs.slice(
            charactersSameAtTheStart,
            markdownInRhs.length - charactersSameAtTheEnd,
        ),
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
    atCellIndexInRhs: number,
): AuthorDocCellDiff | undefined {
    const attributesChanged = attributesChangedBetween(cellInLhs, cellInRhs);
    if (
        cellInLhs.source === cellInRhs.source &&
        Object.keys(attributesChanged).length === 0
    ) {
        return undefined;
    }
    return {
        cellId: cellInRhs.uniqueId,
        cellIsInRhs: true,
        atCellIndexInRhs,
        ...markdownEditBetween(cellInLhs.source, cellInRhs.source),
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
    rhs.cells.forEach((cellInRhs, atCellIndexInRhs) => {
        const cellInLhs = lhs.cellWithId(cellInRhs.uniqueId);
        if (!cellInLhs) {
            differences.push(cellOnlyInRhs(cellInRhs, atCellIndexInRhs));
            return;
        }
        const difference = cellInBoth(cellInLhs, cellInRhs, atCellIndexInRhs);
        if (difference) {
            differences.push(difference);
        }
    });
    return differences;
}
