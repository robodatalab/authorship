import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import type { AuthorDocument } from "../storydoc/model";

interface WrittenSection extends ServerJob {
    text: string;
}

export class WriteBlurbCommand implements AuthorDocumentCommand {
    readonly commandName = "writeBlurb";
    readonly buttonGroup = "run";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const cell = document.cells[commandArguments.cellIndex as number];
        if (!cell) {
            return;
        }
        try {
            await vscode.workspace.fs.writeFile(
                document.uri,
                new TextEncoder().encode(document.text),
            );
            const jobId = await startServerJob("/generate/blurb", {
                path: document.uri.fsPath,
            });
            const blurb = await awaitServerJob<WrittenSection>(
                "/generate/status",
                jobId,
            );
            cell.replaceMarkdown(blurb.text);
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot write the blurb — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        }
    }
}
