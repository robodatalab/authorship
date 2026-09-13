import * as vscode from "vscode";

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
    private messagesStillWaiting = 0;

    constructor(private readonly log: vscode.LogOutputChannel) {}

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
        this.messagesStillWaiting += 1;
        this.log.debug(
            `${message.constructor.name} joins the queue, ${this.messagesStillWaiting} waiting`,
        );
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
        const name = message.constructor.name;
        const began = Date.now();
        this.log.debug(`${name} begins`);
        try {
            for (const listener of this.listeners) {
                await listener.onMessage(message);
            }
            this.log.debug(`${name} ends after ${Date.now() - began}ms`);
        } catch (failure) {
            this.log.error(
                `${name} failed after ${Date.now() - began}ms, and the queue carries on`,
                failure,
            );
            throw failure;
        } finally {
            this.messagesStillWaiting -= 1;
        }
    }
}
