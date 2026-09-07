import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import type { AuthorDocument } from "../storydoc/model";

const DOCUMENTS_THE_STORY_SO_FAR_SUMMARISES = "documents";

interface WrittenSection extends ServerJob {
    text: string;
}

export class WriteStorySoFarCommand implements AuthorDocumentCommand {
    readonly commandName = "writeStorySoFar";
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
        const documents = (
            cell.attrs[DOCUMENTS_THE_STORY_SO_FAR_SUMMARISES] ?? ""
        )
            .split(",")
            .map((named) => named.trim())
            .filter(Boolean);
        if (documents.length === 0) {
            void vscode.window.showErrorMessage(
                "Name the documents to summarise before writing the story so far.",
            );
            return;
        }
        try {
            await vscode.workspace.fs.writeFile(
                document.uri,
                new TextEncoder().encode(document.text),
            );
            const jobId = await startServerJob("/generate/recap", {
                path: document.uri.fsPath,
                documents,
            });
            const storySoFar = await awaitServerJob<WrittenSection>(
                "/generate/status",
                jobId,
            );
            cell.replaceMarkdown(storySoFar.text);
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot write the story so far — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        }
    }
}
