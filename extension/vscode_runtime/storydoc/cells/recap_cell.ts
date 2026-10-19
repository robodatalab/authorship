import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const RECAP = "recap";

export class RecapCell extends Cell {
    readonly kind = RECAP;

    constructor(
        readonly documents: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): RecapCell {
        return new RecapCell(
            this.documents,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): RecapCell {
        return new RecapCell(
            this.documents,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitRecap(this);
    }
}
