import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { ImmutableAuthorDocument } from "../storydoc/model";
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
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) => {
            for (const replaced of (commandArguments.texts ??
                []) as TextToReplace[]) {
                const cell = story.cellWithId(replaced.cellId);
                if (replaced.attributeName === null) {
                    cell?.replaceMarkdown(replaced.text);
                } else {
                    cell?.replaceAttribute(
                        replaced.attributeName,
                        replaced.text,
                    );
                }
            }
        });
    }
}
