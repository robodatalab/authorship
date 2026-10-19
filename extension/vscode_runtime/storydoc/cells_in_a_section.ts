import type { CellOfADocument } from "./cell_of_a_document";

export interface CellsInASection<CellInTheDocument extends CellOfADocument> {
    cell: CellInTheDocument;
    within: CellsInASection<CellInTheDocument>[];
}
