import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { RuntimeCommand } from "./runtime_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import type { SynchronizedRepresentation } from "authordoc/synchronizers/character_range_synchronizer";

export interface ProseCheckError extends SynchronizedRepresentation {
    ruleThatFoundTheError: string;
    isAnErrorOf: "style" | "grammar";
    reasonForError: string;
    correctVersion: string;
}

interface CheckErrorsJob extends ServerJob {
    findings: ProseCheckError[];
}

export const CHECK_PROSE = "checkProse";

export class CheckProseCommand implements RuntimeCommand {
    static deserialize(): CheckProseCommand {
        const command = new CheckProseCommand();
        return command;
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        try {
            const jobId = await startServerJob("/check/errors", {
                path: session.document.path,
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
