import { type Cell, Document, dumps, parse } from "./storydoc";

export class AuthorDocCellDiff {
    constructor(
        readonly cellId: string,
        readonly theyDifferFromCharacter: number,
        readonly headerInLhs: string | undefined,
        readonly headerInRhs: string | undefined,
        readonly textInLhs: string,
        readonly textInRhs: string,
    ) {}

    static between(
        cellInLhs: Cell,
        cellInRhs: Cell,
    ): AuthorDocCellDiff | undefined {
        const headerInLhs = headerOf(cellInLhs);
        const headerInRhs = headerOf(cellInRhs);
        if (
            headerInLhs === headerInRhs &&
            cellInLhs.source === cellInRhs.source
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
            headerInLhs,
            headerInRhs,
            markdownInLhs.slice(
                charactersSameAtTheStart,
                markdownInLhs.length - charactersSameAtTheEnd,
            ),
            markdownInRhs.slice(
                charactersSameAtTheStart,
                markdownInRhs.length - charactersSameAtTheEnd,
            ),
        );
    }

    static takingTheCellOut(cell: Cell): AuthorDocCellDiff {
        const header = headerOf(cell);
        return new AuthorDocCellDiff(
            cell.uniqueId,
            0,
            header,
            undefined,
            cell.source,
            "",
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
            this.headerInRhs,
            this.headerInLhs,
            this.textInRhs,
            this.textInLhs,
        );
    }

    writeInto(cells: Cell[]): Cell[] {
        if (this.headerInRhs === undefined) {
            return cells.filter((cell) => cell.uniqueId !== this.cellId);
        }
        const cellInLhs = cells.find((cell) => cell.uniqueId === this.cellId);
        const sourceInLhs = cellInLhs?.source ?? "";
        const sourceInRhs =
            sourceInLhs.slice(0, this.theyDifferFromCharacter) +
            this.textInRhs +
            sourceInLhs.slice(this.theyDifferToCharacterInLhs);
        const [cellInRhs] = parse(`${this.headerInRhs}\n${sourceInRhs}`);
        return cellInLhs
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

function headerOf(cell: Cell): string {
    const cellWithoutItsText = cell.withSource("");
    return dumps([cellWithoutItsText]);
}
