import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export class ImportChangedFileCommand implements RuntimeCommand {
    constructor(private readonly savedText: string) {}

    invoke(session: AuthorFileEditorSession): void {
        session.importTheFileLeavingTheCellTheAuthorIsEditing(this.savedText);
    }
}
