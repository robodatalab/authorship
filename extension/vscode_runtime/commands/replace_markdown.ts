import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class ReplaceMarkdownCommand implements AuthorDocumentCommand {
    readonly commandName = "replaceMarkdown";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): void {
        document.cells[commandArguments.cellIndex as number]?.replaceMarkdown(
            commandArguments.markdown as string,
        );
    }
}
