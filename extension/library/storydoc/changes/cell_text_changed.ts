import type { AuthorDocChange } from "../author_doc_change";
import type { AuthorDocChangeVisitor } from "../author_doc_change_visitor";
import type { Cell } from "../cells/cell";

export class CellTextChanged implements AuthorDocChange {
    constructor(
        readonly cellId: string,
        readonly fromCharacter: number,
        readonly textRemoved: string,
        readonly textWritten: string,
    ) {}

    static between(
        cellId: string,
        textBefore: string,
        textAfter: string,
    ): CellTextChanged {
        let charactersSameAtTheStart = 0;
        while (
            charactersSameAtTheStart < textBefore.length &&
            charactersSameAtTheStart < textAfter.length &&
            textBefore[charactersSameAtTheStart] ===
                textAfter[charactersSameAtTheStart]
        ) {
            charactersSameAtTheStart += 1;
        }
        let charactersSameAtTheEnd = 0;
        while (
            charactersSameAtTheEnd <
                textBefore.length - charactersSameAtTheStart &&
            charactersSameAtTheEnd <
                textAfter.length - charactersSameAtTheStart &&
            textBefore[textBefore.length - 1 - charactersSameAtTheEnd] ===
                textAfter[textAfter.length - 1 - charactersSameAtTheEnd]
        ) {
            charactersSameAtTheEnd += 1;
        }
        const textRemoved = textBefore.slice(
            charactersSameAtTheStart,
            textBefore.length - charactersSameAtTheEnd,
        );
        const textWritten = textAfter.slice(
            charactersSameAtTheStart,
            textAfter.length - charactersSameAtTheEnd,
        );
        return new CellTextChanged(
            cellId,
            charactersSameAtTheStart,
            textRemoved,
            textWritten,
        );
    }

    accept<Result>(visitor: AuthorDocChangeVisitor<Result>): Result {
        return visitor.visitCellTextChanged(this);
    }

    invert(): CellTextChanged {
        return new CellTextChanged(
            this.cellId,
            this.fromCharacter,
            this.textWritten,
            this.textRemoved,
        );
    }

    textAfter(textBefore: string): string {
        const textAhead = textBefore.slice(0, this.fromCharacter);
        const textBehind = textBefore.slice(
            this.fromCharacter + this.textRemoved.length,
        );
        return textAhead + this.textWritten + textBehind;
    }

    applyTo(cells: readonly Cell[]): Cell[] {
        return cells.map((cell) => {
            if (cell.uniqueId !== this.cellId) {
                return cell;
            }
            const textAfter = this.textAfter(cell.source);
            return cell.withSource(textAfter);
        });
    }
}
