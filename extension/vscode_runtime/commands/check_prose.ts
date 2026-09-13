import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import type { SynchronizedRepresentation } from "../storydoc/author_doc_synch";

export interface ProseCheckError extends SynchronizedRepresentation {
    ruleThatFoundTheError: string;
    isAnErrorOf: "style" | "grammar";
    reasonForError: string;
    correctVersion: string;
}

interface CheckErrorsJob extends ServerJob {
    findings: ProseCheckError[];
}

export class CheckProseCommand implements AuthorDocumentCommand {
    readonly commandName = "checkProse";
    readonly buttonGroup = "check";
    readonly iconClassName = "codicon codicon-checklist";
    readonly tooltip =
        "Check Prose — read the whole session.document for faults of usage and style";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        try {
            const jobId = await startServerJob("/check/errors", {
                path: session.document.uri.fsPath,
                text: session.document.text,
            });
            const checked = await awaitServerJob<CheckErrorsJob>(
                "/check/errors/status",
                jobId,
                (job) => session.showProseErrors(job.findings),
            );
            session.showProseErrors(checked.findings);
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot check the prose — is the model server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        }
    }
}
