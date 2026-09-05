import * as vscode from "vscode";

import { authorFileEditorSession } from "../author_file_editor_session";
import { placeInFile, type AuthorDocumentProseError } from "../prose/model";
import {
    awaitModelServerJob,
    startModelServerJob,
    type ModelServerJob,
} from "../server/jobs";
import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

interface SpanFixJob extends ModelServerJob {
    replacement?: string;
    /** The rule's own answer: false when the fault is still there afterwards. */
    verified?: boolean;
}

export class FixProseErrorCommand implements AuthorDocumentCommand {
    readonly name = "fixProseError";
    readonly category = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    /**
     * Put right the one thing a check found.
     *
     * Whatever found the fault sometimes knows what belongs there — a misspelling
     * has a spelling, a redundancy has a shorter form — and then there is nothing
     * for a model to work out. Everything else is asked of the model by the rule
     * that fired, and its answer is refused if the rule still fires on it.
     */
    async invoke(
        document: AuthorDocument,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const asked = errorAsked(document, payload.id as number);
        if (!asked) {
            return;
        }
        if (asked.replacements.length > 0) {
            write(document, asked.id, asked.replacements[0]);
            return;
        }
        const at = placeInFile(document, asked.cell, asked.at);
        const end = placeInFile(document, asked.cell, asked.end);
        if (!at || !end) {
            return;
        }
        try {
            const id = await startModelServerJob("/fix/span", {
                path: document.uri.fsPath,
                text: document.text,
                where: { at, end },
                rule: asked.rule,
                message: asked.message,
                detail: asked.detail,
            });
            const done = await awaitModelServerJob<SpanFixJob>(
                "/fix/span/status",
                id,
            );
            if (done.cancelled) {
                return;
            }
            if (!done.replacement) {
                void vscode.window.showInformationMessage(
                    "Nothing came back for that one.",
                );
                return;
            }
            if (!done.verified) {
                void vscode.window.showInformationMessage(
                    `That is still flagged after the change, so it was not made: “${done.replacement}”`,
                );
                return;
            }
            write(document, asked.id, done.replacement);
        } catch (err: unknown) {
            void vscode.window.showWarningMessage(
                `Could not fix that: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
}

function errorAsked(
    document: AuthorDocument,
    id: number,
): AuthorDocumentProseError | undefined {
    return authorFileEditorSession(document)?.proseCheck.errors.find(
        (found) => found.id === id,
    );
}

/**
 * Written over the words as they stand now.
 *
 * The error is looked up again rather than kept: the author goes on writing
 * while the model reads, and the check has been moving the span all the while.
 */
function write(
    document: AuthorDocument,
    id: number,
    replacement: string,
): void {
    const error = errorAsked(document, id);
    if (!error) {
        return;
    }
    const source = error.cell.source;
    error.cell.replaceMarkdown(
        source.slice(0, error.at) + replacement + source.slice(error.end),
    );
}
