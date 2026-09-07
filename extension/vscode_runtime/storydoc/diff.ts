import { AuthorDocument, Cell } from "./model";

export const CELL_ADDED = "cellAdded";
export const CELL_DELETED = "cellDeleted";
export const CELL_MARKDOWN_EDITED = "cellMarkdownEdited";
export const CELL_ATTRIBUTE_EDITED = "cellAttributeEdited";

export interface CellAdded {
    whatHappened: typeof CELL_ADDED;
    cellId: string;
    atCellIndex: number;
}

export interface CellDeleted {
    whatHappened: typeof CELL_DELETED;
    cellId: string;
}

export interface CellMarkdownEdited {
    whatHappened: typeof CELL_MARKDOWN_EDITED;
    cellId: string;
    editedFromOffsetInCell: number;
    charactersRemoved: number;
    insertedText: string;
}

export interface CellAttributeEdited {
    whatHappened: typeof CELL_ATTRIBUTE_EDITED;
    cellId: string;
    attributeName: string;
    attributeValueNow: string | undefined;
}

export type AuthorDocumentChange =
    | CellAdded
    | CellDeleted
    | CellMarkdownEdited
    | CellAttributeEdited;

function markdownEditBetween(
    markdownBefore: string,
    markdownNow: string,
): Omit<CellMarkdownEdited, "whatHappened" | "cellId"> | undefined {
    if (markdownBefore === markdownNow) {
        return undefined;
    }
    let charactersSameAtTheStart = 0;
    while (
        charactersSameAtTheStart < markdownBefore.length &&
        charactersSameAtTheStart < markdownNow.length &&
        markdownBefore[charactersSameAtTheStart] ===
            markdownNow[charactersSameAtTheStart]
    ) {
        charactersSameAtTheStart += 1;
    }
    let charactersSameAtTheEnd = 0;
    while (
        charactersSameAtTheEnd <
            markdownBefore.length - charactersSameAtTheStart &&
        charactersSameAtTheEnd <
            markdownNow.length - charactersSameAtTheStart &&
        markdownBefore[markdownBefore.length - 1 - charactersSameAtTheEnd] ===
            markdownNow[markdownNow.length - 1 - charactersSameAtTheEnd]
    ) {
        charactersSameAtTheEnd += 1;
    }
    return {
        editedFromOffsetInCell: charactersSameAtTheStart,
        charactersRemoved:
            markdownBefore.length -
            charactersSameAtTheStart -
            charactersSameAtTheEnd,
        insertedText: markdownNow.slice(
            charactersSameAtTheStart,
            markdownNow.length - charactersSameAtTheEnd,
        ),
    };
}

function attributeEditsBetween(
    cellBefore: Cell,
    cellNow: Cell,
): CellAttributeEdited[] {
    const attributeNames = new Set([
        ...Object.keys(cellBefore.attrs),
        ...Object.keys(cellNow.attrs),
    ]);
    return [...attributeNames]
        .filter(
            (attributeName) =>
                cellBefore.attrs[attributeName] !==
                cellNow.attrs[attributeName],
        )
        .map((attributeName) => ({
            whatHappened: CELL_ATTRIBUTE_EDITED as typeof CELL_ATTRIBUTE_EDITED,
            cellId: cellNow.uniqueId,
            attributeName,
            attributeValueNow: cellNow.attrs[attributeName],
        }));
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
): AuthorDocumentChange[] {
    const changes: AuthorDocumentChange[] = [];
    for (const cellBefore of lhs.cells) {
        if (!rhs.cellWithId(cellBefore.uniqueId)) {
            changes.push({
                whatHappened: CELL_DELETED,
                cellId: cellBefore.uniqueId,
            });
        }
    }
    rhs.cells.forEach((cellNow, atCellIndex) => {
        const cellBefore = lhs.cellWithId(cellNow.uniqueId);
        if (!cellBefore) {
            changes.push({
                whatHappened: CELL_ADDED,
                cellId: cellNow.uniqueId,
                atCellIndex,
            });
            return;
        }
        const markdownEdit = markdownEditBetween(
            cellBefore.source,
            cellNow.source,
        );
        if (markdownEdit) {
            changes.push({
                whatHappened: CELL_MARKDOWN_EDITED,
                cellId: cellNow.uniqueId,
                ...markdownEdit,
            });
        }
        changes.push(...attributeEditsBetween(cellBefore, cellNow));
    });
    return changes;
}
