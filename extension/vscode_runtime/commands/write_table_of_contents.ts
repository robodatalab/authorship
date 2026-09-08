import type { AuthorDocumentCommand } from "./author_document_command";
import { authorFileEditorSession } from "../author_file_editor_session";
import { CHAPTER, CONTENTS, type AuthorDocument } from "../storydoc/model";

function contentsOf(document: AuthorDocument): string {
    return document.cells
        .filter((cell) => cell.kind === CHAPTER)
        .map((chapter) => `1. ${chapter.attrs.title || "Untitled"}`)
        .join("\n");
}

export class WriteTableOfContentsCommand implements AuthorDocumentCommand {
    readonly commandName = "writeTableOfContents";
    readonly buttonGroup = "run";
    readonly iconClassName = "";
    readonly tooltip = "";
    readonly runsCellsOfKind = CONTENTS;

    invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): void {
        document
            .cellWithId(commandArguments.cellId as string)
            ?.replaceMarkdown(contentsOf(document));
        authorFileEditorSession(document)?.sendDocument();
    }
}
