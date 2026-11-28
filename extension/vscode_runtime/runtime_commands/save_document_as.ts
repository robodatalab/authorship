import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export class SaveDocumentAsCommand implements RuntimeCommand {
    constructor(private readonly destination: vscode.Uri) {}

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        await session.writeTheDocumentTo(this.destination);
    }
}
