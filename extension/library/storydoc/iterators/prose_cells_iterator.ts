import { MarkdownCell } from "../cells/markdown_cell";
import type { Document } from "../storydoc";

export class ProseCellsIterator implements Iterable<MarkdownCell> {
    constructor(private readonly document: Document) {}

    *[Symbol.iterator](): Iterator<MarkdownCell> {
        for (const cell of this.document.cells) {
            if (cell instanceof MarkdownCell) {
                yield cell;
            }
        }
    }
}
