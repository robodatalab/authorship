import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { ImmutableAuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class ReplaceAttributeCommand implements AuthorDocumentCommand {
    readonly commandName = "replaceAttribute";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) =>
            story
                .cellWithId(commandArguments.cellId as string)
                ?.replaceAttribute(
                    commandArguments.attributeName as string,
                    commandArguments.attributeValue as string,
                ),
        );
    }
}
