import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const DISCLAIMER = "disclaimer";

export class DisclaimerCell extends Cell {
    readonly kind = DISCLAIMER;

    constructor(
        readonly title: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): DisclaimerCell {
        return new DisclaimerCell(
            this.title,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): DisclaimerCell {
        return new DisclaimerCell(
            this.title,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitDisclaimer(this);
    }
}
