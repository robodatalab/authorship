import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "./author_file_editor_session";
import {
    deserializeRuntimeCommand,
    type RuntimeCommand,
} from "./runtime_commands/runtime_command";

export class VsCodeCommandExecutor {
    private theCommandBeforeThisOne: Promise<void> = Promise.resolve();
    private commandsStillWaiting = 0;

    constructor(
        private readonly session: AuthorFileEditorSession,
        private readonly log: vscode.LogOutputChannel,
    ) {}

    executeMessageReceivedFromWebview(
        serialized: Record<string, unknown>,
    ): void {
        const command = deserializeRuntimeCommand(serialized);
        void this.post(command);
    }

    post(command: RuntimeCommand): Promise<void> {
        this.commandsStillWaiting += 1;
        this.log.debug(
            `${command.constructor.name} joins the queue, ${this.commandsStillWaiting} waiting`,
        );
        const invoked = this.theCommandBeforeThisOne.then(() =>
            this.execute(command),
        );
        this.theCommandBeforeThisOne = invoked.then(
            () => undefined,
            () => undefined,
        );
        return invoked;
    }

    private async execute(command: RuntimeCommand): Promise<void> {
        const name = command.constructor.name;
        const began = Date.now();
        this.log.debug(`${name} begins`);
        try {
            await command.invoke(this.session);
            this.log.debug(`${name} ends after ${Date.now() - began}ms`);
        } catch (failure) {
            this.log.error(
                `${name} failed after ${Date.now() - began}ms, and the queue carries on`,
                failure,
            );
            throw failure;
        } finally {
            this.commandsStillWaiting -= 1;
        }
    }
}
