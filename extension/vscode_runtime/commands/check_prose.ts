import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import {
    awaitModelServerJob,
    startModelServerJob,
    type ModelServerJob,
} from "../server/jobs";
import type { AuthorDocument } from "../storydoc/model";

export interface ProseSpan {
    startLineIndex: number;
    startCharacterIndexInLine: number;
    endLineIndex: number;
    endCharacterIndexInLine: number;
}

export interface ProseCheckError extends ProseSpan {
    ruleThatFoundTheError: string;
    isAnErrorOf: "style" | "grammar";
    reasonForError: string;
    correctVersion: string;
}

interface PlaceAsTheServerSendsIt {
    line: number;
    character: number;
}

interface ErrorAsTheServerSendsIt {
    rule: string;
    kind: "style" | "usage";
    detail: string;
    at: PlaceAsTheServerSendsIt;
    end: PlaceAsTheServerSendsIt;
    related: { at: PlaceAsTheServerSendsIt; end: PlaceAsTheServerSendsIt }[];
    replacements: string[];
}

interface ProseCheckJob extends ModelServerJob {
    findings: ErrorAsTheServerSendsIt[];
}

function proseSpan(
    at: PlaceAsTheServerSendsIt,
    end: PlaceAsTheServerSendsIt,
): ProseSpan {
    return {
        startLineIndex: at.line,
        startCharacterIndexInLine: at.character,
        endLineIndex: end.line,
        endCharacterIndexInLine: end.character,
    };
}

function proseCheckErrors(
    errorFromTheServer: ErrorAsTheServerSendsIt,
): ProseCheckError[] {
    const everywhereTheErrorRuns = [
        { at: errorFromTheServer.at, end: errorFromTheServer.end },
        ...errorFromTheServer.related,
    ];
    return everywhereTheErrorRuns.map((span) => ({
        ...proseSpan(span.at, span.end),
        ruleThatFoundTheError: errorFromTheServer.rule,
        isAnErrorOf: errorFromTheServer.kind === "style" ? "style" : "grammar",
        reasonForError: errorFromTheServer.detail,
        correctVersion: errorFromTheServer.replacements[0] ?? "",
    }));
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
            const errors = checkedProse.findings.flatMap(proseCheckErrors);
            void vscode.window.showInformationMessage(
                `Checked the prose of ${vscode.workspace.asRelativePath(document.uri)}: ${errors.length} errors.`,
            );
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot check the prose — is the model server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        }
    }
}
