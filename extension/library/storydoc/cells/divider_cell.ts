import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const DIVIDER = "divider";

export class DividerCell extends Cell {
    readonly kind = DIVIDER;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): DividerCell {
        return new DividerCell(source, this.folded, this.at, this.uniqueId);
    }

    withFolded(folded: boolean): DividerCell {
        return new DividerCell(this.source, folded, this.at, this.uniqueId);
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitDivider(this);
    }
}
