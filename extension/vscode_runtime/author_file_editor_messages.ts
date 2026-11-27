import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "./author_file_editor_session";
import type { AuthorFileEditorMessage } from "./vscode_command_executor";
import type { StoryWordRange } from "authordoc/cells/story_word_range";

export class ThePageIsReady implements AuthorFileEditorMessage {
    invoke(session: AuthorFileEditorSession): void {
        session.sendDocument();
    }
}

export class TheAuthorTypedInTheCell implements AuthorFileEditorMessage {
    constructor(
        private readonly cellId: string,
        private readonly markdown: string,
    ) {}

    invoke(session: AuthorFileEditorSession): void {
        session.theAuthorTypedInTheCell(this.cellId, this.markdown);
    }
}

export class TheAuthorIsEditingTheCell implements AuthorFileEditorMessage {
    constructor(private readonly cellId: string | null) {}

    invoke(session: AuthorFileEditorSession): void {
        session.theAuthorIsEditingTheCell(this.cellId);
    }
}

export class TheAuthorAskedToSeeTheStoryWords implements AuthorFileEditorMessage {
    constructor(private readonly storyWordRange: StoryWordRange) {}

    invoke(session: AuthorFileEditorSession): void {
        session.showTheStoryWordRange(this.storyWordRange);
    }
}

export class TheFileChangedUnderneath implements AuthorFileEditorMessage {
    constructor(private readonly savedText: string) {}

    invoke(session: AuthorFileEditorSession): void {
        session.importTheFileLeavingTheCellTheAuthorIsEditing(this.savedText);
    }
}

export class WriteTheDocumentToItsFile implements AuthorFileEditorMessage {
    async invoke(session: AuthorFileEditorSession): Promise<void> {
        await session.writeTheDocumentToItsFile();
    }
}

export class WriteTheDocumentTo implements AuthorFileEditorMessage {
    constructor(private readonly destination: vscode.Uri) {}

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        await session.writeTheDocumentTo(this.destination);
    }
}

export class ReadTheDocumentBackFromItsFile implements AuthorFileEditorMessage {
    async invoke(session: AuthorFileEditorSession): Promise<void> {
        await session.readTheDocumentBackFromItsFile();
    }
}
