import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export class UnknownCell extends Cell {
    constructor(
        readonly kind: string,
        readonly attrs: Readonly<Record<string, string>> = {},
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): UnknownCell {
        return new UnknownCell(
            this.kind,
            this.attrs,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): UnknownCell {
        return new UnknownCell(
            this.kind,
            this.attrs,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitUnknown(this);
    }
}
