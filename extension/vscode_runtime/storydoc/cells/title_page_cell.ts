import { Cell } from "./cell";
import type { CellVisitor } from "./cell_visitor";

export const TITLE_PAGE = "title-page";

export class TitlePageCell extends Cell {
    readonly kind = TITLE_PAGE;

    constructor(
        readonly title: string = "",
        readonly subtitle: string = "",
        readonly author: string = "",
        readonly publisher: string = "",
        readonly date: string = "",
        readonly version: string = "",
        readonly isbn: string = "",
        readonly coverDesigner: string = "",
        readonly language: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): TitlePageCell {
        return new TitlePageCell(
            this.title,
            this.subtitle,
            this.author,
            this.publisher,
            this.date,
            this.version,
            this.isbn,
            this.coverDesigner,
            this.language,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): TitlePageCell {
        return new TitlePageCell(
            this.title,
            this.subtitle,
            this.author,
            this.publisher,
            this.date,
            this.version,
            this.isbn,
            this.coverDesigner,
            this.language,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitTitlePage(this);
    }
}
