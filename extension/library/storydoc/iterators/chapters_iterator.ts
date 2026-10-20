import type { Cell } from "../cells/cell";
import { ChapterCell } from "../cells/chapter_cell";
import type { Document } from "../storydoc";
import { ChapterLinesIterator } from "./chapter_lines_iterator";

/** The raw contents of chapters - stripped of comments and any other information */
export class ChaptersIterator implements Iterable<
    [string, ChapterLinesIterator]
> {
    constructor(private readonly document: Document) {}

    *[Symbol.iterator](): Iterator<[string, ChapterLinesIterator]> {
        let chaptersFound = 0;
        let title: string | null = null;
        let cellsOfTheChapter: Cell[] = [];
        for (const cell of this.document.cells) {
            if (cell instanceof ChapterCell) {
                if (title !== null) {
                    const chapterLines = new ChapterLinesIterator(
                        this.document,
                        cellsOfTheChapter,
                    );
                    yield [title, chapterLines];
                }
                chaptersFound += 1;
                title = cell.title || `Chapter ${chaptersFound}`;
                cellsOfTheChapter = [];
            } else if (title !== null) {
                cellsOfTheChapter.push(cell);
            }
        }
        if (title !== null) {
            const chapterLines = new ChapterLinesIterator(
                this.document,
                cellsOfTheChapter,
            );
            yield [title, chapterLines];
        }
    }
}
