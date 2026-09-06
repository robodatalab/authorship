import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import {
    awaitModelServerJob,
    startModelServerJob,
    type ModelServerJob,
} from "../server/jobs";
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

export class CheckProseCommand implements AuthorDocumentCommand {
    readonly commandName = "checkProse";
    readonly buttonGroup = "check";
    readonly iconClassName = "codicon codicon-checklist";
    readonly tooltip =
        "Check Prose — read the whole document for faults of usage and style";

    async invoke(document: AuthorDocument): Promise<void> {
        try {
            const jobId = await startModelServerJob("/check/prose", {
                path: document.uri.fsPath,
                text: document.text,
            });
            const checkedProse = await awaitModelServerJob<ProseCheckJob>(
                "/check/prose/status",
                jobId,
            );
            void vscode.window.showInformationMessage(
                `Checked the prose of ${vscode.workspace.asRelativePath(document.uri)}: ${checkedProse.findings.length} errors.`,
            );
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot check the prose — is the model server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        }
    }
}
