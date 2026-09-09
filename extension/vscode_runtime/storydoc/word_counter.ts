import { MARKDOWN, type AuthorDocument, type Cell } from "./model";
import {
    cellsBySection,
    cellsWithinASection,
    opensASection,
    type CellsInASection,
} from "./sections";

export function numberOfWords(markdown: string): number {
    return markdown.split(/\s+/).filter((word) => /\w/.test(word)).length;
}

function wordsInTheCells(cells: readonly Cell[]): number {
    return cells
        .filter((cell) => cell.kind === MARKDOWN)
        .reduce((words, cell) => words + numberOfWords(cell.source), 0);
}

export class WordCounter {
    private wordsInEachSection = new Map<string, number>();
    private wordsInTheWholeDocument = 0;

    synchronize(document: AuthorDocument): void {
        this.wordsInEachSection = new Map<string, number>();
        this.countSections(cellsBySection(document.cells));
        this.wordsInTheWholeDocument = wordsInTheCells(document.cells);
    }

    private countSections(sections: CellsInASection<Cell>[]): void {
        for (const section of sections) {
            if (opensASection(section.cell.kind)) {
                this.wordsInEachSection.set(
                    section.cell.uniqueId,
                    wordsInTheCells(cellsWithinASection(section)),
                );
            }
            this.countSections(section.within);
        }
    }

    wordsInTheSection(cellId: string): number | undefined {
        return this.wordsInEachSection.get(cellId);
    }

    get wordsInTheDocument(): number {
        return this.wordsInTheWholeDocument;
    }

    get wordsInEverySection(): Record<string, number> {
        return Object.fromEntries(this.wordsInEachSection);
    }
}
