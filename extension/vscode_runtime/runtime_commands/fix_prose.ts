import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";
import type { ProseCheckError } from "./check_prose";

export const FIX_PROSE = "fixProse";

export class FixProseCommand implements RuntimeCommand {
    constructor(private readonly error: ProseCheckError) {}

    static deserialize(serialized: Record<string, unknown>): FixProseCommand {
        const error = serialized as unknown as ProseCheckError;
        const command = new FixProseCommand(error);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const cell = story.cellWithId(this.error.cellId);
            if (!cell || this.error.correctVersion === "") {
                return story;
            }
            const proseBefore = cell.source.slice(
                0,
                this.error.startCharacterOffsetInCell,
            );
            const proseAfter = cell.source.slice(
                this.error.endCharacterOffsetInCell,
            );
            const proseFixed =
                proseBefore + this.error.correctVersion + proseAfter;
            const cellFixed = cell.withSource(proseFixed);
            const storyFixed = story.withCell(cellFixed);
            return storyFixed;
        });
    }
}
