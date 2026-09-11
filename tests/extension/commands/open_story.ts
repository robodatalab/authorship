import * as vscode from "vscode";

import {
    dialogs,
    files,
    executedCommands,
    geminiKeyInTheKeychain,
    settings,
    shownMessages,
} from "../vscode";
import {
    openAuthorFileEditorSession,
    type AuthorFileEditorSession,
} from "../../../extension/vscode_runtime/author_file_editor_session";

export const STORY_FILE = "/stories/story.author";

export const sentToThePage: unknown[] = [];

export function openStory(text: string): AuthorFileEditorSession {
    const session = openAuthorFileEditorSession(
        vscode.Uri.file(STORY_FILE) as never,
        text.replace(/^\n/, ""),
        new vscode.EventEmitter() as never,
    );
    session.showOn({
        webview: {
            postMessage: (message: unknown) => sentToThePage.push(message),
        },
    } as never);
    return session;
}

export function storyOfThreeCells(): AuthorFileEditorSession {
    return openStory(`
<!-- cell: chapter title="One" id="c1" -->

<!-- cell: markdown id="c2" -->

She saw the door.

<!-- cell: markdown id="c3" -->

He heard the bell.
`);
}

export function forgetWhatTheEditorDid(): void {
    sentToThePage.length = 0;
    files.clear();
    executedCommands.length = 0;
    shownMessages.length = 0;
    dialogs.filesTheAuthorChose = [];
    dialogs.answerToTheWarning = undefined;
    settings.clear();
    geminiKeyInTheKeychain.key = undefined;
}
