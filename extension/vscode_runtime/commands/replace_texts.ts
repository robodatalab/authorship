import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

interface TextToReplace {
    cellId: string;
    attributeName: string | null;
    text: string;
}

export class ReplaceTextsCommand implements AuthorDocumentCommand {
    readonly commandName = "replaceTexts";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): void {
        for (const replaced of (commandArguments.texts ??
            []) as TextToReplace[]) {
            const cell = document.cellWithId(replaced.cellId);
            if (replaced.attributeName === null) {
                cell?.replaceMarkdown(replaced.text);
            } else {
                cell?.replaceAttribute(replaced.attributeName, replaced.text);
            }
        }
    }
}
