import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export class SaveDocumentCommand implements RuntimeCommand {
    async invoke(session: AuthorFileEditorSession): Promise<void> {
        await session.writeTheDocumentToItsFile();
    }
}
