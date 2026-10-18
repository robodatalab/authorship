import {
    ABOUT,
    BLURB,
    CHAPTER,
    DISCLAIMER,
    PART,
    PLOT,
    RECAP,
    SALIENT_CONCEPT,
    TABLE_OF_CONTENTS,
    TITLE_PAGE,
    type Cell,
    type Document,
} from "./storydoc";

const KINDS_THAT_STAND_OUTSIDE_THE_STORY = new Set([
    TITLE_PAGE,
    TABLE_OF_CONTENTS,
    DISCLAIMER,
    ABOUT,
    BLURB,
    RECAP,
    SALIENT_CONCEPT,
    PLOT,
]);

export interface CellOfADocument {
    readonly kind: string;
    readonly uniqueId: string;
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

export function standsOutsideTheStory(kind: string): boolean {
    return KINDS_THAT_STAND_OUTSIDE_THE_STORY.has(kind);
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
    const cellsHeld = section.within.flatMap((held) =>
        cellsWithinASection(held),
    );
    return [section.cell, ...cellsHeld];
}

export function whereACellStands<CellInTheDocument extends CellOfADocument>(
    sections: CellsInASection<CellInTheDocument>[],
    cellId: string,
    under: CellsInASection<CellInTheDocument>[] = [],
): WhereACellStands<CellInTheDocument> | undefined {
    for (const section of sections) {
        if (section.cell.uniqueId === cellId) {
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

function whereTheCellStands(document: Document, cell: Cell): number {
    return document.cells.findIndex(
        (inTheDocument) => inTheDocument.uniqueId === cell.uniqueId,
    );
}

function endOfSection(
    document: Document,
    section: CellsInASection<Cell>,
): number {
    const standsAt = whereTheCellStands(document, section.cell);
    const cellsHeld = cellsWithinASection(section);
    return standsAt + cellsHeld.length;
}

function moveSection(
    document: Document,
    section: CellsInASection<Cell>,
    lands: number,
): void {
    const standsAt = whereTheCellStands(document, section.cell);
    const cellsHeld = cellsWithinASection(section);
    const moved = document.cells.splice(standsAt, cellsHeld.length);
    const landsAfterTheMove =
        lands > standsAt ? lands - cellsHeld.length : lands;
    document.cells.splice(landsAfterTheMove, 0, ...moved);
}

export function moveTheSectionUp(document: Document, cellId: string): void {
    const sections = cellsBySection(document.cells);
    const standing = whereACellStands(sections, cellId);
    if (!standing) {
        return;
    }
    const { section, among, under } = standing;
    const standsAmongAt = among.indexOf(section);
    const goesBefore = among[standsAmongAt - 1] ?? under[under.length - 1];
    if (goesBefore) {
        const lands = whereTheCellStands(document, goesBefore.cell);
        moveSection(document, section, lands);
    }
}

export function moveTheSectionDown(document: Document, cellId: string): void {
    const sections = cellsBySection(document.cells);
    const standing = whereACellStands(sections, cellId);
    if (!standing) {
        return;
    }
    const { section, among, under } = standing;
    const standsAmongAt = among.indexOf(section);
    const nextInTheScope = among[standsAmongAt + 1];
    if (nextInTheScope) {
        const lands = endOfSection(document, nextInTheScope);
        moveSection(document, section, lands);
        return;
    }
    const scopeItLeaves = under[under.length - 1];
    if (!scopeItLeaves) {
        return;
    }
    const endOfTheScope = endOfSection(document, scopeItLeaves);
    const pastTheCellThatEndsTheScope = endOfTheScope + 1;
    if (pastTheCellThatEndsTheScope <= document.cells.length) {
        moveSection(document, section, pastTheCellThatEndsTheScope);
    }
}

export function removeTheSection(document: Document, cellId: string): void {
    const sections = cellsBySection(document.cells);
    const standing = whereACellStands(sections, cellId);
    if (!standing) {
        return;
    }
    const standsAt = whereTheCellStands(document, standing.section.cell);
    const cellsHeld = cellsWithinASection(standing.section);
    document.cells.splice(standsAt, cellsHeld.length);
}
