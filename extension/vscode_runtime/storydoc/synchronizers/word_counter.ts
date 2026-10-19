import type { AuthorDocSynchronizer } from "./author_doc_synchronizer";
import type { AuthorDocDiff } from "../diff";
import type { Document } from "../storydoc";
import type { Cell } from "../cells/cell";
import { MARKDOWN } from "../cells/markdown_cell";
import {
    cellsBySection,
    cellsWithinASection,
    opensASection,
} from "../story_sections";
import type { CellsInASection } from "../cells_in_a_section";

function numberOfWords(markdown: string): number {
    return markdown.split(/\s+/).filter((word) => /\w/.test(word)).length;
}

function wordsInTheCells(cells: readonly Cell[]): number {
    return cells
        .filter((cell) => cell.kind === MARKDOWN)
        .reduce((words, cell) => words + numberOfWords(cell.source), 0);
}

export class WordCounter implements AuthorDocSynchronizer {
    private wordsInEachSection = new Map<string, number>();
    private wordsInTheWholeDocument = 0;

    synchronize(before: Document, change: AuthorDocDiff): void {
        const after = change.applyTheDiff(before);
        this.wordsInEachSection = new Map<string, number>();
        this.countSections(cellsBySection(after.cells));
        this.wordsInTheWholeDocument = wordsInTheCells(after.cells);
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
