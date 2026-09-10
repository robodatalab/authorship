import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import type { SynchronizedRepresentation } from "../storydoc/author_doc_synch";
import type { ImmutableAuthorDocument } from "../storydoc/model";

export interface ProseCheckError extends SynchronizedRepresentation {
    ruleThatFoundTheError: string;
    isAnErrorOf: "style" | "grammar";
    reasonForError: string;
    correctVersion: string;
}

interface ProseCheckJob extends ServerJob {
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
    const jobId = await startServerJob(route, documentToCheck);
    const checked = await awaitServerJob<ProseCheckJob>(
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
        "Check Prose — read the whole session.document for faults of usage and style";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const documentToCheck = {
            path: session.document.uri.fsPath,
            text: session.document.text,
        };
        try {
            const rulesFound = await startAndAwaitServerJob(
                "/check/prose",
                documentToCheck,
            );
            session.showProseErrors(rulesFound);
            const grammarFound = await startAndAwaitServerJob(
                "/check/grammar",
                documentToCheck,
            );
            session.showProseErrors([...rulesFound, ...grammarFound]);
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot check the prose — is the model server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        }
    }
}
