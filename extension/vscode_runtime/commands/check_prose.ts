import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import {
    awaitModelServerJob,
    startModelServerJob,
    type ModelServerJob,
} from "../server/jobs";
import { authorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocument } from "../storydoc/model";

export interface ProseCheckError {
    cellId: string;
    startOffsetInCell: number;
    endOffsetInCell: number;
    ruleThatFoundTheError: string;
    isAnErrorOf: "style" | "grammar";
    reasonForError: string;
    correctVersion: string;
}

interface ProseCheckJob extends ModelServerJob {
    findings: ProseCheckError[];
}

interface DocumentToCheck {
    path: string;
    text: string;
}

async function startAndAwaitServerJob(
    route: string,
    documentToCheck: DocumentToCheck,
): Promise<ProseCheckError[]> {
    const jobId = await startModelServerJob(route, documentToCheck);
    const checked = await awaitModelServerJob<ProseCheckJob>(
        `${route}/status`,
        jobId,
    );
    return checked.findings;
}

export class CheckProseCommand implements AuthorDocumentCommand {
    readonly commandName = "checkProse";
    readonly buttonGroup = "check";
    readonly iconClassName = "codicon codicon-checklist";
    readonly tooltip =
        "Check Prose — read the whole document for faults of usage and style";

    async invoke(document: AuthorDocument): Promise<void> {
        const documentToCheck = {
            path: document.uri.fsPath,
            text: document.text,
        };
        try {
            const rulesFound = await startAndAwaitServerJob(
                "/check/prose",
                documentToCheck,
            );
            authorFileEditorSession(document)?.showProseErrors(rulesFound);
            const grammarFound = await startAndAwaitServerJob(
                "/check/grammar",
                documentToCheck,
            );
            authorFileEditorSession(document)?.showProseErrors([
                ...rulesFound,
                ...grammarFound,
            ]);
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot check the prose — is the model server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        }
    }
}
