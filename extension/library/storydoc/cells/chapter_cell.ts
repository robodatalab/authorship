import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const CHAPTER = "chapter";

export class ChapterCell extends Cell {
    readonly kind = CHAPTER;

    constructor(
        readonly title: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): ChapterCell {
        return new ChapterCell(
            this.title,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): ChapterCell {
        return new ChapterCell(
            this.title,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitChapter(this);
    }
}
