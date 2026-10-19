import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const NOTE = "note";

export class NoteCell extends Cell {
    readonly kind = NOTE;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): NoteCell {
        return new NoteCell(source, this.folded, this.at, this.uniqueId);
    }

    withFolded(folded: boolean): NoteCell {
        return new NoteCell(this.source, folded, this.at, this.uniqueId);
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitNote(this);
    }
}
