import type { ReactNode } from "react";
import type { AuthorDocument } from "../storydoc/model";

export type AuthorDocumentCellRenderers = Record<
    string,
    (document: AuthorDocument, cellIndex: number) => ReactNode
>;
