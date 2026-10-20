import { splitComments } from "../parser";
import type { Document } from "../storydoc";
import { ProseCellsIterator } from "./prose_cells_iterator";

/**
 * The story itself, line by line: the prose of the markdown cells,
 * by the line of the document each is written on.
 */
export class StoryLinesIterator implements Iterable<[number, string]> {
    constructor(
        private readonly document: Document,
        private readonly start: number = 0,
        private readonly end: number | null = null,
    ) {}

    *[Symbol.iterator](): Iterator<[number, string]> {
        const lines = this.document.lines;
        const last = this.end === null ? lines.length - 1 : this.end;
        const proseCells = new ProseCellsIterator(this.document);
        for (const cell of proseCells) {
            if (cell.at === null) {
                continue;
            }
            const [first, final] = cell.at;
            const covered = Array.from(
                { length: final + 1 - first },
                (_, offset) => first + offset,
            );
            const coveredLines = covered.map((i) => lines[i]);
            // A cell's prose may carry the author's own notes, and those are no
            // more story than the markers around them.
            const keptRanges = splitComments(coveredLines, covered);
            for (const [keptFirst, keptLast] of keptRanges) {
                for (
                    let index = Math.max(keptFirst, this.start);
                    index < Math.min(keptLast, last) + 1;
                    index += 1
                ) {
                    if (lines[index].trim()) {
                        yield [index, lines[index]];
                    }
                }
            }
        }
    }
}
