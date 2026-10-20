import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const BLURB = "blurb";

export class BlurbCell extends Cell {
    readonly kind = BLURB;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): BlurbCell {
        return new BlurbCell(source, this.folded, this.at, this.uniqueId);
    }

    withFolded(folded: boolean): BlurbCell {
        return new BlurbCell(this.source, folded, this.at, this.uniqueId);
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitBlurb(this);
    }
}
