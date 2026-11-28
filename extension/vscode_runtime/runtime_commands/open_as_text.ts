import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { RuntimeCommand } from "./runtime_command";

export const OPEN_AS_TEXT = "openAsText";

export class OpenAsTextCommand implements RuntimeCommand {
    static deserialize(): OpenAsTextCommand {
        const command = new OpenAsTextCommand();
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        void vscode.commands.executeCommand(
            "vscode.openWith",
            session.uri,
            "default",
        );
    }
}
