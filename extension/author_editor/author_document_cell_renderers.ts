import type { ReactNode } from "react";
import type { Cell } from "../storydoc/model";

export type AuthorDocumentCellRenderers = Record<
    string,
    (cell: Cell) => ReactNode
>;
