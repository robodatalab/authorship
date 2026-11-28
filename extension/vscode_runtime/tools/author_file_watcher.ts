import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { ImportChangedFileCommand } from "../runtime_commands/import_changed_file";
import type { VsCodeCommandExecutor } from "../vscode_command_executor";

export function watchTheAuthorFileForChanges(
    session: AuthorFileEditorSession,
    commandExecutor: VsCodeCommandExecutor,
): vscode.Disposable {
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
            vscode.Uri.joinPath(session.uri, ".."),
            session.uri.path.split("/").pop() ?? "",
        ),
    );
    const changed = watcher.onDidChange(async () => {
        const bytes = await vscode.workspace.fs.readFile(session.uri);
        const savedText = new TextDecoder().decode(bytes);
        if (savedText === session.document.text) {
            return;
        }
        await commandExecutor.processCommand(
            new ImportChangedFileCommand(savedText),
        );
    });
    return vscode.Disposable.from(changed, watcher);
}
