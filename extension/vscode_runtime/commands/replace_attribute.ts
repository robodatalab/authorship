import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class ReplaceAttributeCommand implements AuthorDocumentCommand {
    readonly commandName = "replaceAttribute";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): void {
        document
            .cellWithId(commandArguments.cellId as string)
            ?.replaceAttribute(
                commandArguments.attributeName as string,
                commandArguments.attributeValue as string,
            );
    }
}
