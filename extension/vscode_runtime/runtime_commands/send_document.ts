import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export const SEND_DOCUMENT = "ready";

export class SendDocumentCommand implements RuntimeCommand {
    static deserialize(): SendDocumentCommand {
        const command = new SendDocumentCommand();
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.sendDocument();
    }
}
