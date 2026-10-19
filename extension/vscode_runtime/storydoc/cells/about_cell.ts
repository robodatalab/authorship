import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const ABOUT = "about";

export class AboutCell extends Cell {
    readonly kind = ABOUT;

    constructor(
        readonly kdp: string = "",
        readonly website: string = "",
        readonly substack: string = "",
        readonly portrait: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): AboutCell {
        return new AboutCell(
            this.kdp,
            this.website,
            this.substack,
            this.portrait,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): AboutCell {
        return new AboutCell(
            this.kdp,
            this.website,
            this.substack,
            this.portrait,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitAbout(this);
    }
}
