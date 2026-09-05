import { FOLDED, type AuthorDocument } from "../storydoc/model";
import type {
    AuthorDocumentCommand,
    AuthorDocumentCommandVisibility,
} from "./author_document_command";

export class FoldCellCommand implements AuthorDocumentCommand {
    readonly category = "cell";
    readonly visibleWhen: AuthorDocumentCommandVisibility;

    constructor(
        readonly name: string,
        readonly iconClassName: string,
        readonly tooltip: string,
        private readonly folded: boolean,
    ) {
        this.visibleWhen = { attribute: FOLDED, value: folded ? "" : "true" };
    }

    invoke(document: AuthorDocument, payload: Record<string, unknown>): void {
        document.cells[payload.at as number]?.fold(this.folded);
    }
}
