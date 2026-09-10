import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "./author_file_editor_session";
import { authorDocumentCommand } from "./commands/author_document_commands";
import type {
    AuthorFileEditorMessage,
    MessageQueueBetweenVscodeAndWebview,
} from "./message_queue_between_vscode_and_webview";

export class ThePageIsReady implements AuthorFileEditorMessage {
    invoke(): void {}
}

export class AnAuthorDocumentCommandWasInvoked implements AuthorFileEditorMessage {
    constructor(
        readonly commandName: string,
        readonly commandArguments: Record<string, unknown>,
        private readonly queue: MessageQueueBetweenVscodeAndWebview,
        private readonly edited: vscode.EventEmitter<
            vscode.CustomDocumentEditEvent<AuthorFileEditorSession>
        >,
    ) {}

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const before = session.document.text;
        await authorDocumentCommand(this.commandName)?.invoke(
            session,
            this.commandArguments,
        );
        const after = session.document.text;
        if (after === before) {
            return;
        }
        const wentBackTo = (text: string) => () =>
            void this.queue.post(new TheDocumentWentBackTo(text));
        this.edited.fire({
            document: session,
            label: "Edit",
            undo: wentBackTo(before),
            redo: wentBackTo(after),
        });
    }
}

export class TheDocumentWentBackTo implements AuthorFileEditorMessage {
    constructor(private readonly text: string) {}

    invoke(session: AuthorFileEditorSession): void {
        session.importDocumentFromText(this.text);
    }
}

export class TheFileChangedUnderneath implements AuthorFileEditorMessage {
    constructor(private readonly savedText: string) {}

    invoke(session: AuthorFileEditorSession): void {
        session.importDocumentFromText(this.savedText);
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
