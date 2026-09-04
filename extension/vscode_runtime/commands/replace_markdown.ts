import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class ReplaceMarkdownCommand implements AuthorDocumentCommand {
    readonly name = "replaceMarkdown";
    readonly category = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(document: AuthorDocument, payload: Record<string, unknown>): void {
        document.cells[payload.at as number]?.replaceMarkdown(
            payload.markdown as string,
        );
    }
}
