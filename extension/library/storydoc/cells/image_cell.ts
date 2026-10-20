import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const IMAGE = "image";

export class ImageCell extends Cell {
    readonly kind = IMAGE;

    constructor(
        readonly src: string = "",
        readonly fullPage: boolean = true,
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): ImageCell {
        return new ImageCell(
            this.src,
            this.fullPage,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): ImageCell {
        return new ImageCell(
            this.src,
            this.fullPage,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitImage(this);
    }
}
