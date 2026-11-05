import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import type { ProseCheckError } from "./check_prose";

export class FixProseCommand implements AuthorDocumentCommand {
    readonly commandName = "fixProse";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const error = commandArguments as unknown as ProseCheckError;
        session.changeTheDocument((story) => {
            const cell = story.cellWithId(error.cellId);
            if (!cell || error.correctVersion === "") {
                return story;
            }
            const proseBefore = cell.source.slice(
                0,
                error.startCharacterOffsetInCell,
            );
            const proseAfter = cell.source.slice(
                error.endCharacterOffsetInCell,
            );
            const proseFixed =
                proseBefore + error.correctVersion + proseAfter;
            const cellFixed = cell.withSource(proseFixed);
            const storyFixed = story.withCell(cellFixed);
            return storyFixed;
        });
    }
}
