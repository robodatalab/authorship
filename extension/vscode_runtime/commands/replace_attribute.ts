import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class ReplaceAttributeCommand implements AuthorDocumentCommand {
    readonly name = "replaceAttribute";
    readonly category = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(document: AuthorDocument, payload: Record<string, unknown>): void {
        document.cells[payload.at as number]?.replaceAttribute(
            payload.name as string,
            payload.value as string,
        );
    }
}
