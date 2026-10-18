import { Cell, Document, dumps } from "./storydoc";

const NO_ATTRIBUTES: Readonly<Record<string, string | undefined>> =
    Object.freeze({});

export class AuthorDocCellDiff {
    constructor(
        readonly cellId: string,
        readonly theyDifferFromCharacter: number,
        readonly kindInLhs: string | undefined,
        readonly kindInRhs: string | undefined,
        readonly textInLhs: string,
        readonly textInRhs: string,
        readonly attributesInLhs: Readonly<Record<string, string | undefined>>,
        readonly attributesInRhs: Readonly<Record<string, string | undefined>>,
    ) {}

    static between(
        cellInLhs: Cell,
        cellInRhs: Cell,
    ): AuthorDocCellDiff | undefined {
        const attributesChanged = attributesWhereTheyDiffer(
            cellInLhs,
            cellInRhs,
        );
        if (
            cellInLhs.kind === cellInRhs.kind &&
            cellInLhs.source === cellInRhs.source &&
            Object.keys(attributesChanged.inRhs).length === 0
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

        return new AuthorDocCellDiff(
            cellInRhs.uniqueId,
            charactersSameAtTheStart,
            cellInLhs.kind,
            cellInRhs.kind,
            markdownInLhs.slice(
                charactersSameAtTheStart,
                markdownInLhs.length - charactersSameAtTheEnd,
            ),
            markdownInRhs.slice(
                charactersSameAtTheStart,
                markdownInRhs.length - charactersSameAtTheEnd,
            ),
            attributesChanged.inLhs,
            attributesChanged.inRhs,
        );
    }

    static takingTheCellOut(cell: Cell): AuthorDocCellDiff {
        return new AuthorDocCellDiff(
            cell.uniqueId,
            0,
            cell.kind,
            undefined,
            cell.source,
            "",
            { ...cell.attrs },
            NO_ATTRIBUTES,
        );
    }

    get theyDifferToCharacterInLhs(): number {
        return this.theyDifferFromCharacter + this.textInLhs.length;
    }

    get theyDifferToCharacterInRhs(): number {
        return this.theyDifferFromCharacter + this.textInRhs.length;
    }

    invert(): AuthorDocCellDiff {
        return new AuthorDocCellDiff(
            this.cellId,
            this.theyDifferFromCharacter,
            this.kindInRhs,
            this.kindInLhs,
            this.textInRhs,
            this.textInLhs,
            this.attributesInRhs,
            this.attributesInLhs,
        );
    }

    writeInto(cells: Cell[]): Cell[] {
        if (this.kindInRhs === undefined) {
            return cells.filter((cell) => cell.uniqueId !== this.cellId);
        }
        const cellInLhs =
            cells.find((cell) => cell.uniqueId === this.cellId) ??
            new Cell(this.kindInRhs, "", { id: this.cellId });
        const attributes: Record<string, string> = { ...cellInLhs.attrs };
        for (const [attributeName, attributeValue] of Object.entries(
            this.attributesInRhs,
        )) {
            if (attributeValue === undefined) {
                delete attributes[attributeName];
            } else {
                attributes[attributeName] = attributeValue;
            }
        }
        const cellInRhs = new Cell(
            this.kindInRhs,
            cellInLhs.source.slice(0, this.theyDifferFromCharacter) +
                this.textInRhs +
                cellInLhs.source.slice(this.theyDifferToCharacterInLhs),
            attributes,
        );
        return cells.some((cell) => cell.uniqueId === this.cellId)
            ? cells.map((cell) =>
                  cell.uniqueId === this.cellId ? cellInRhs : cell,
              )
            : [...cells, cellInRhs];
    }
}

export class AuthorDocDiff {
    constructor(
        readonly cells: readonly AuthorDocCellDiff[],
        readonly cellIdsInLhs: readonly string[] | undefined,
        readonly cellIdsInRhs: readonly string[] | undefined,
    ) {}

    static diff(lhs: Document, rhs: Document): AuthorDocDiff {
        const cells: AuthorDocCellDiff[] = [];
        for (const cellInLhs of lhs.cells) {
            if (
                !rhs.cells.some((cell) => cell.uniqueId === cellInLhs.uniqueId)
            ) {
                cells.push(AuthorDocCellDiff.takingTheCellOut(cellInLhs));
            }
        }
        for (const cellInRhs of rhs.cells) {
            const cellInLhs = lhs.cells.find(
                (cell) => cell.uniqueId === cellInRhs.uniqueId,
            );
            if (!cellInLhs) {
                cells.push(
                    AuthorDocCellDiff.takingTheCellOut(cellInRhs).invert(),
                );
                continue;
            }
            const cellDiff = AuthorDocCellDiff.between(cellInLhs, cellInRhs);
            if (cellDiff) {
                cells.push(cellDiff);
            }
        }
        const theyStandInTheSameOrder =
            lhs.cells.length === rhs.cells.length &&
            lhs.cells.every(
                (cell, standing) =>
                    cell.uniqueId === rhs.cells[standing].uniqueId,
            );
        return new AuthorDocDiff(
            cells,
            theyStandInTheSameOrder ? undefined : cellIdsOf(lhs),
            theyStandInTheSameOrder ? undefined : cellIdsOf(rhs),
        );
    }

    empty(): boolean {
        return this.cells.length === 0 && this.cellIdsInRhs === undefined;
    }

    invert(): AuthorDocDiff {
        return new AuthorDocDiff(
            this.cells.map((cellDiff) => cellDiff.invert()),
            this.cellIdsInRhs,
            this.cellIdsInLhs,
        );
    }

    applyTheDiff(document: Document): Document {
        let cells = [...document.cells];
        for (const cellDiff of this.cells) {
            cells = cellDiff.writeInto(cells);
        }
        for (const [standing, cellId] of this.cellIdsInRhs?.entries() ?? []) {
            const standsAt = cells.findIndex((cell) => cell.uniqueId === cellId);
            if (standsAt !== standing) {
                const moved = cells.splice(standsAt, 1);
                cells.splice(
                    standing > standsAt ? standing - 1 : standing,
                    0,
                    ...moved,
                );
            }
        }
        return new Document(dumps(cells), document.path);
    }
}

function cellIdsOf(document: Document): string[] {
    return document.cells.map((cell) => cell.uniqueId);
}

function attributesWhereTheyDiffer(
    cellInLhs: Cell,
    cellInRhs: Cell,
): {
    inLhs: Record<string, string | undefined>;
    inRhs: Record<string, string | undefined>;
} {
    const attributeNames = [
        ...new Set([
            ...Object.keys(cellInLhs.attrs),
            ...Object.keys(cellInRhs.attrs),
        ]),
    ].filter(
        (attributeName) =>
            cellInLhs.attrs[attributeName] !== cellInRhs.attrs[attributeName],
    );
    if (attributeNames.length === 0) {
        return { inLhs: NO_ATTRIBUTES, inRhs: NO_ATTRIBUTES };
    }
    const inLhs: Record<string, string | undefined> = {};
    const inRhs: Record<string, string | undefined> = {};
    for (const attributeName of attributeNames) {
        inLhs[attributeName] = cellInLhs.attrs[attributeName];
        inRhs[attributeName] = cellInRhs.attrs[attributeName];
    }
    return { inLhs, inRhs };
}
