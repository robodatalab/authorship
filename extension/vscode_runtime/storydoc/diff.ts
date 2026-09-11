import {
    ImmutableAuthorDocument,
    ImmutableCell,
    MutableAuthorDocument,
    MutableCell,
    UNIQUE_CELL_ID,
} from "./model";

export interface AuthorDocCellAsOneDocumentHasIt {
    readonly kind: string | undefined;
    readonly textWhereTheyDiffer: string;
    readonly attributesWhereTheyDiffer: Readonly<
        Record<string, string | undefined>
    >;
}

export class AuthorDocCellDiff {
    constructor(
        readonly cellId: string,
        readonly theyDifferFromCharacter: number,
        readonly inLhs: AuthorDocCellAsOneDocumentHasIt,
        readonly inRhs: AuthorDocCellAsOneDocumentHasIt,
    ) {}

    static between(
        cellInLhs: ImmutableCell,
        cellInRhs: ImmutableCell,
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
            {
                kind: cellInLhs.kind,
                textWhereTheyDiffer: markdownInLhs.slice(
                    charactersSameAtTheStart,
                    markdownInLhs.length - charactersSameAtTheEnd,
                ),
                attributesWhereTheyDiffer: attributesChanged.inLhs,
            },
            {
                kind: cellInRhs.kind,
                textWhereTheyDiffer: markdownInRhs.slice(
                    charactersSameAtTheStart,
                    markdownInRhs.length - charactersSameAtTheEnd,
                ),
                attributesWhereTheyDiffer: attributesChanged.inRhs,
            },
        );
    }

    static takingTheCellOut(cell: ImmutableCell): AuthorDocCellDiff {
        return new AuthorDocCellDiff(
            cell.uniqueId,
            0,
            {
                kind: cell.kind,
                textWhereTheyDiffer: cell.source,
                attributesWhereTheyDiffer: { ...cell.attrs },
            },
            {
                kind: undefined,
                textWhereTheyDiffer: "",
                attributesWhereTheyDiffer: {},
            },
        );
    }

    get theyDifferToCharacterInLhs(): number {
        return (
            this.theyDifferFromCharacter + this.inLhs.textWhereTheyDiffer.length
        );
    }

    get theyDifferToCharacterInRhs(): number {
        return (
            this.theyDifferFromCharacter + this.inRhs.textWhereTheyDiffer.length
        );
    }

    invert(): AuthorDocCellDiff {
        return new AuthorDocCellDiff(
            this.cellId,
            this.theyDifferFromCharacter,
            this.inRhs,
            this.inLhs,
        );
    }

    writeInto(document: MutableAuthorDocument): void {
        if (this.inRhs.kind === undefined) {
            document.removeCell(this.cellId);
            return;
        }
        const cell =
            document.cellWithId(this.cellId) ??
            document.insertAt(
                document.cells.length,
                new MutableCell(this.inRhs.kind, "", {
                    [UNIQUE_CELL_ID]: this.cellId,
                }),
            );
        cell.kind = this.inRhs.kind;
        cell.replaceMarkdown(
            cell.source.slice(0, this.theyDifferFromCharacter) +
                this.inRhs.textWhereTheyDiffer +
                cell.source.slice(this.theyDifferToCharacterInLhs),
        );
        for (const [attributeName, attributeValue] of Object.entries(
            this.inRhs.attributesWhereTheyDiffer,
        )) {
            cell.replaceAttribute(attributeName, attributeValue);
        }
    }
}

export class AuthorDocDiff {
    constructor(
        readonly cells: readonly AuthorDocCellDiff[],
        readonly cellIdsInLhs: readonly string[] | undefined,
        readonly cellIdsInRhs: readonly string[] | undefined,
    ) {}

    static diff(
        lhs: ImmutableAuthorDocument,
        rhs: ImmutableAuthorDocument,
    ): AuthorDocDiff {
        const cells: AuthorDocCellDiff[] = [];
        for (const cellInLhs of lhs.cells) {
            if (!rhs.cellWithId(cellInLhs.uniqueId)) {
                cells.push(AuthorDocCellDiff.takingTheCellOut(cellInLhs));
            }
        }
        for (const cellInRhs of rhs.cells) {
            const cellInLhs = lhs.cellWithId(cellInRhs.uniqueId);
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

    applyTheDiff(document: ImmutableAuthorDocument): ImmutableAuthorDocument {
        const documentBeingChanged = new MutableAuthorDocument(
            document.uri,
            document.text,
        );
        for (const cellDiff of this.cells) {
            cellDiff.writeInto(documentBeingChanged);
        }
        for (const [standing, cellId] of this.cellIdsInRhs?.entries() ?? []) {
            const standsAt = documentBeingChanged.cells.findIndex(
                (cell) => cell.uniqueId === cellId,
            );
            if (standsAt !== standing) {
                documentBeingChanged.moveCellsAt(standsAt, 1, standing);
            }
        }
        return documentBeingChanged.toImmutable();
    }
}

function cellIdsOf(document: ImmutableAuthorDocument): string[] {
    return document.cells.map((cell) => cell.uniqueId);
}

function attributesWhereTheyDiffer(
    cellInLhs: ImmutableCell,
    cellInRhs: ImmutableCell,
): {
    inLhs: Record<string, string | undefined>;
    inRhs: Record<string, string | undefined>;
} {
    const attributeNames = new Set([
        ...Object.keys(cellInLhs.attrs),
        ...Object.keys(cellInRhs.attrs),
    ]);
    const inLhs: Record<string, string | undefined> = {};
    const inRhs: Record<string, string | undefined> = {};
    for (const attributeName of attributeNames) {
        if (cellInLhs.attrs[attributeName] !== cellInRhs.attrs[attributeName]) {
            inLhs[attributeName] = cellInLhs.attrs[attributeName];
            inRhs[attributeName] = cellInRhs.attrs[attributeName];
        }
    }
    return { inLhs, inRhs };
}
