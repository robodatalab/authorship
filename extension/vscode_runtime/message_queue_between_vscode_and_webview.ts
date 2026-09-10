import type { AuthorFileEditorSession } from "./author_file_editor_session";

export interface AuthorFileEditorMessage {
    invoke(session: AuthorFileEditorSession): void | Promise<void>;
}

export interface MessageQueueListener {
    onMessage(message: AuthorFileEditorMessage): void | Promise<void>;
}

export class MessageQueueBetweenVscodeAndWebview {
    private readonly listeners: MessageQueueListener[] = [];
    private theMessageBeforeThisOne: Promise<void> = Promise.resolve();

    addListener(listener: MessageQueueListener): void {
        this.listeners.push(listener);
    }

    removeListener(listener: MessageQueueListener): void {
        const standing = this.listeners.indexOf(listener);
        if (standing >= 0) {
            this.listeners.splice(standing, 1);
        }
    }

    post(message: AuthorFileEditorMessage): Promise<void> {
        const invoked = this.theMessageBeforeThisOne.then(() =>
            this.notifyAllListeners(message),
        );
        this.theMessageBeforeThisOne = invoked.then(
            () => undefined,
            () => undefined,
        );
        return invoked;
    }

    private async notifyAllListeners(
        message: AuthorFileEditorMessage,
    ): Promise<void> {
        for (const listener of this.listeners) {
            await listener.onMessage(message);
        }
    }
}
