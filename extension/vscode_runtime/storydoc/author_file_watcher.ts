import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { TheFileChangedUnderneath } from "../author_file_editor_messages";
import type { MessageQueueBetweenVscodeAndWebview } from "../message_queue_between_vscode_and_webview";

export function watchTheAuthorFileForChanges(
    session: AuthorFileEditorSession,
    documentChanges: MessageQueueBetweenVscodeAndWebview,
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
        await documentChanges.post(new TheFileChangedUnderneath(savedText));
    });
    return vscode.Disposable.from(changed, watcher);
}
