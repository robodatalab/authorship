import * as vscode from "vscode";

import { dialogs, files, executedCommands, shownMessages } from "../vscode";
import { AuthorDocument } from "../../../extension/vscode_runtime/storydoc/model";

export const STORY_FILE = "/stories/story.author";

export function openStory(text: string): AuthorDocument {
    return new AuthorDocument(
        vscode.Uri.file(STORY_FILE) as never,
        text.replace(/^\n/, ""),
    );
}

export function storyOfThreeCells(): AuthorDocument {
    return openStory(`
<!-- cell: chapter title="One" id="c1" -->

<!-- cell: markdown id="c2" -->

She saw the door.

<!-- cell: markdown id="c3" -->

He heard the bell.
`);
}

export function forgetWhatTheEditorDid(): void {
    files.clear();
    executedCommands.length = 0;
    shownMessages.length = 0;
    dialogs.filesTheAuthorChose = [];
    dialogs.answerToTheWarning = undefined;
}
