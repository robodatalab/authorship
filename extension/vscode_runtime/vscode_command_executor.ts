import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "./author_file_editor_session";
import {
    TheAuthorAskedToSeeTheStoryWords,
    TheAuthorIsEditingTheCell,
    TheAuthorSelectedStoryText,
    TheAuthorSelectedTheStoryAnnotation,
    TheAuthorSelectedThePassage,
    TheAuthorTypedInTheCell,
    ThePageIsReady,
} from "./author_file_editor_messages";
import { authorDocumentCommand } from "./runtime_commands/author_document_commands";
import { StoryWordRange } from "authordoc/cells/story_word_range";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";

export interface AuthorFileEditorMessage {
    invoke(session: AuthorFileEditorSession): void | Promise<void>;
}

export interface MessageReceivedFromWebview {
    type?: string;
    cellId?: string | null;
    commandName?: string;
    commandArguments?: Record<string, unknown>;
    markdown?: string;
    storyTextSelected?: StoryTextSpan | null;
    cellKind?: string;
    annotationCellId?: string | null;
    passageId?: string | null;
    firstWord?: number;
    lastWord?: number;
}

export class VsCodeCommandExecutor {
    private theMessageBeforeThisOne: Promise<void> = Promise.resolve();
    private messagesStillWaiting = 0;

    constructor(
        private readonly session: AuthorFileEditorSession,
        private readonly log: vscode.LogOutputChannel,
    ) {}

    executeMessageReceivedFromWebview(
        message: MessageReceivedFromWebview,
    ): void {
        if (message?.type === "typed" && message.cellId) {
            const typed = new TheAuthorTypedInTheCell(
                message.cellId,
                message.markdown ?? "",
            );
            void this.post(typed);
        } else if (message?.type === "editing") {
            const editing = new TheAuthorIsEditingTheCell(
                message.cellId ?? null,
            );
            void this.post(editing);
        } else if (message?.type === "storyTextSelected") {
            const storyTextSelected = new TheAuthorSelectedStoryText(
                message.storyTextSelected ?? null,
            );
            void this.post(storyTextSelected);
        } else if (
            message?.type === "selectStoryAnnotation" &&
            message.cellKind
        ) {
            const storyAnnotationSelected =
                new TheAuthorSelectedTheStoryAnnotation(
                    message.cellKind,
                    message.annotationCellId ?? null,
                );
            void this.post(storyAnnotationSelected);
        } else if (
            message?.type === "showStoryWordRange" &&
            message.firstWord !== undefined &&
            message.lastWord !== undefined
        ) {
            const storyWordRange = new StoryWordRange(
                message.firstWord,
                message.lastWord,
            );
            const storyWordsAskedFor = new TheAuthorAskedToSeeTheStoryWords(
                storyWordRange,
            );
            void this.post(storyWordsAskedFor);
        } else if (message?.type === "selectPassage" && message.cellKind) {
            const passageSelected = new TheAuthorSelectedThePassage(
                message.cellKind,
                message.passageId ?? null,
            );
            void this.post(passageSelected);
        } else if (message?.type === "ready") {
            this.session.sendCommandCards();
            const pageReady = new ThePageIsReady();
            void this.post(pageReady);
        } else if (message?.type === "invoke" && message.commandName) {
            const command = authorDocumentCommand(message.commandName);
            void command?.invoke(this.session, message.commandArguments ?? {});
        }
    }

    post(message: AuthorFileEditorMessage): Promise<void> {
        this.messagesStillWaiting += 1;
        this.log.debug(
            `${message.constructor.name} joins the queue, ${this.messagesStillWaiting} waiting`,
        );
        const invoked = this.theMessageBeforeThisOne.then(() =>
            this.execute(message),
        );
        this.theMessageBeforeThisOne = invoked.then(
            () => undefined,
            () => undefined,
        );
        return invoked;
    }

    private async execute(message: AuthorFileEditorMessage): Promise<void> {
        const name = message.constructor.name;
        const began = Date.now();
        this.log.debug(`${name} begins`);
        try {
            await message.invoke(this.session);
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
