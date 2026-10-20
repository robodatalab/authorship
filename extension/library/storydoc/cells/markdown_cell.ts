import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const MARKDOWN = "markdown";

export class MarkdownCell extends Cell {
    readonly kind = MARKDOWN;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): MarkdownCell {
        return new MarkdownCell(source, this.folded, this.at, this.uniqueId);
    }

    withFolded(folded: boolean): MarkdownCell {
        return new MarkdownCell(this.source, folded, this.at, this.uniqueId);
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitMarkdown(this);
    }
}
