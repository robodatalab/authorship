import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const TABLE_OF_CONTENTS = "contents";

export class TableOfContentsCell extends Cell {
    readonly kind = TABLE_OF_CONTENTS;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): TableOfContentsCell {
        return new TableOfContentsCell(
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): TableOfContentsCell {
        return new TableOfContentsCell(
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitTableOfContents(this);
    }
}
