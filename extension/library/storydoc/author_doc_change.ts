import type { AuthorDocChangeVisitor } from "./author_doc_change_visitor";
import type { Cell } from "./cells/cell";

export interface AuthorDocChange {
    accept<Result>(visitor: AuthorDocChangeVisitor<Result>): Result;
    invert(): AuthorDocChange;
    applyTo(cells: readonly Cell[]): Cell[];
}
