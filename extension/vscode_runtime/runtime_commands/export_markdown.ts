import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { RuntimeCommand } from "./runtime_command";
import { toMarkdown } from "../markdown/exporter";

function markdownFileBeside(authorFile: vscode.Uri): vscode.Uri {
    return authorFile.with({
        path: authorFile.path.replace(/\.author$/i, "") + ".md",
    });
}

export const EXPORT_MARKDOWN = "exportMarkdown";

export class ExportMarkdownCommand implements RuntimeCommand {
    static deserialize(): ExportMarkdownCommand {
        const command = new ExportMarkdownCommand();
        return command;
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const manuscript = markdownFileBeside(session.uri);
        await vscode.workspace.fs.writeFile(
            manuscript,
            new TextEncoder().encode(toMarkdown(session.document.cells)),
        );
        void vscode.window.showInformationMessage(
            `Exported ${vscode.workspace.asRelativePath(session.uri)} to ${vscode.workspace.asRelativePath(manuscript)}`,
        );
    }
}
