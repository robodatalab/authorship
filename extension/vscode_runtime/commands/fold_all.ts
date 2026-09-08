import { FOLDED, type AuthorDocument } from "../storydoc/model";
import type {
    AuthorDocumentCommand,
    CellAttributeCondition,
} from "./author_document_command";

export class FoldAllCommand implements AuthorDocumentCommand {
    readonly buttonGroup = "fold";
    readonly drawnWhenCellAttributeIs: CellAttributeCondition;

    constructor(
        readonly commandName: string,
        readonly iconClassName: string,
        readonly tooltip: string,
        private readonly folded: boolean,
    ) {
        this.drawnWhenCellAttributeIs = {
            attributeName: FOLDED,
            attributeValue: folded ? "" : "true",
        };
    }

    invoke(document: AuthorDocument): void {
        for (const cell of document.cells) {
            cell.fold(this.folded);
        }
    }
}
