import type { CellVisitor } from "./cell_visitor";

export function splitlines(text: string): string[] {
    const lines = text.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
    if (lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines;
}

/**
 * One thing the document is made of, and what it says it is.
 *
 * `kind` is the cell's identity and is never inferred from its text — a chapter
 * called "Disclaimer" is still a chapter.
 */
export abstract class Cell {
    abstract readonly kind: string;

    constructor(
        readonly source: string,
        readonly folded: boolean,
        readonly at: readonly [number, number] | null,
        readonly uniqueId: string,
    ) {}

    offsetOf(line: number, character: number): number {
        if (this.at === null) {
            throw new Error(`Cell ${this.uniqueId} stands on no line`);
        }
        const above = splitlines(this.source).slice(0, line - this.at[0]);
        return (
            above.reduce((sum, written) => sum + written.length + 1, 0) +
            character
        );
    }

    abstract withSource(source: string): Cell;

    abstract withFolded(folded: boolean): Cell;

    abstract accept<Result>(visitor: CellVisitor<Result>): Result;
}
