import { standsOutsideTheStory } from "./cell_kinds";
import {
    CHAPTER,
    PART,
    UNIQUE_CELL_ID,
    type ImmutableAuthorDocument,
    type ImmutableCell,
    MutableAuthorDocument,
} from "./model";

export interface CellOfADocument {
    readonly kind: string;
    readonly attrs: Readonly<Record<string, string>>;
}

export interface CellsInASection<CellInTheDocument extends CellOfADocument> {
    cell: CellInTheDocument;
    within: CellsInASection<CellInTheDocument>[];
}

export interface WhereACellStands<CellInTheDocument extends CellOfADocument> {
    section: CellsInASection<CellInTheDocument>;
    among: CellsInASection<CellInTheDocument>[];
    under: CellsInASection<CellInTheDocument>[];
}

export function opensASection(kind: string): boolean {
    return kind === PART || kind === CHAPTER;
}

export function aSectionOfKindHolds(
    sectionKind: string,
    kind: string,
): boolean {
    if (standsOutsideTheStory(kind)) {
        return false;
    }
    if (sectionKind === PART) {
        return kind !== PART;
    }
    return sectionKind === CHAPTER && !opensASection(kind);
}

export function cellsBySection<CellInTheDocument extends CellOfADocument>(
    cells: readonly CellInTheDocument[],
): CellsInASection<CellInTheDocument>[] {
    const wholeDocument: CellsInASection<CellInTheDocument>[] = [];
    const openSections: CellsInASection<CellInTheDocument>[] = [];
    for (const cell of cells) {
        while (
            openSections.length > 0 &&
            !aSectionOfKindHolds(
                openSections[openSections.length - 1].cell.kind,
                cell.kind,
            )
        ) {
            openSections.pop();
        }
        const section: CellsInASection<CellInTheDocument> = {
            cell,
            within: [],
        };
        (openSections[openSections.length - 1]?.within ?? wholeDocument).push(
            section,
        );
        openSections.push(section);
    }
    return wholeDocument;
}

export function cellsWithinASection<CellInTheDocument extends CellOfADocument>(
    section: CellsInASection<CellInTheDocument>,
): CellInTheDocument[] {
    return [
        section.cell,
        ...section.within.flatMap((held) => cellsWithinASection(held)),
    ];
}

export function whereACellStands<CellInTheDocument extends CellOfADocument>(
    sections: CellsInASection<CellInTheDocument>[],
    cellId: string,
    under: CellsInASection<CellInTheDocument>[] = [],
): WhereACellStands<CellInTheDocument> | undefined {
    for (const section of sections) {
        if (section.cell.attrs[UNIQUE_CELL_ID] === cellId) {
            return { section, among: sections, under };
        }
        const standing = whereACellStands(section.within, cellId, [
            ...under,
            section,
        ]);
        if (standing) {
            return standing;
        }
    }
    return undefined;
}

function endOfSection(
    document: ImmutableAuthorDocument,
    section: CellsInASection<ImmutableCell>,
): number {
    return (
        whereTheCellStands(document, section.cell) +
        cellsWithinASection(section).length
    );
}

function whereTheCellStands(
    document: ImmutableAuthorDocument,
    cell: ImmutableCell,
): number {
    return document.cells.findIndex(
        (inTheDocument) => inTheDocument.uniqueId === cell.uniqueId,
    );
}

function moveSection(
    document: MutableAuthorDocument,
    section: CellsInASection<ImmutableCell>,
    lands: number,
): void {
    document.moveCellsAt(
        whereTheCellStands(document, section.cell),
        cellsWithinASection(section).length,
        lands,
    );
}

export function moveTheSectionUp(
    document: MutableAuthorDocument,
    cellId: string,
): void {
    const standing = whereACellStands(cellsBySection(document.cells), cellId);
    if (!standing) {
        return;
    }
    const { section, among, under } = standing;
    const goesBefore =
        among[among.indexOf(section) - 1] ?? under[under.length - 1];
    if (goesBefore) {
        moveSection(
            document,
            section,
            whereTheCellStands(document, goesBefore.cell),
        );
    }
}

export function moveTheSectionDown(
    document: MutableAuthorDocument,
    cellId: string,
): void {
    const standing = whereACellStands(cellsBySection(document.cells), cellId);
    if (!standing) {
        return;
    }
    const { section, among, under } = standing;
    const nextInTheScope = among[among.indexOf(section) + 1];
    if (nextInTheScope) {
        moveSection(document, section, endOfSection(document, nextInTheScope));
        return;
    }
    const scopeItLeaves = under[under.length - 1];
    if (!scopeItLeaves) {
        return;
    }
    const pastTheCellThatEndsTheScope =
        endOfSection(document, scopeItLeaves) + 1;
    if (pastTheCellThatEndsTheScope <= document.cells.length) {
        moveSection(document, section, pastTheCellThatEndsTheScope);
    }
}

export function removeTheSection(
    document: MutableAuthorDocument,
    cellId: string,
): void {
    const standing = whereACellStands(cellsBySection(document.cells), cellId);
    if (!standing) {
        return;
    }
    document.removeCellsAt(
        whereTheCellStands(document, standing.section.cell),
        cellsWithinASection(standing.section).length,
    );
}
