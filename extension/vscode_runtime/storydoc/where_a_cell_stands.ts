import type { CellOfADocument } from "./cell_of_a_document";
import type { CellsInASection } from "./cells_in_a_section";

export interface WhereACellStands<CellInTheDocument extends CellOfADocument> {
    section: CellsInASection<CellInTheDocument>;
    among: CellsInASection<CellInTheDocument>[];
    under: CellsInASection<CellInTheDocument>[];
}
