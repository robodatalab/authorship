import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const PART = "part";

export class PartCell extends Cell {
    readonly kind = PART;

    constructor(
        readonly title: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): PartCell {
        return new PartCell(
            this.title,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): PartCell {
        return new PartCell(
            this.title,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitPart(this);
    }
}
