import type { Cell } from "../cells/cell";
import type { Document } from "../storydoc";
import { StoryLinesIterator } from "./story_lines_iterator";

export class ChapterLinesIterator implements Iterable<[number, string]> {
    constructor(
        private readonly document: Document,
        private readonly cells: readonly Cell[],
    ) {}

    *[Symbol.iterator](): Iterator<[number, string]> {
        for (const cell of this.cells) {
            if (cell.at === null) {
                continue;
            }
            const [first, final] = cell.at;
            const linesOfTheCell = new StoryLinesIterator(
                this.document,
                first,
                final,
            );
            yield* linesOfTheCell;
        }
    }

    text(): string {
        const lines = Array.from(this, ([, line]) => line);
        return lines.join("\n");
    }
}
