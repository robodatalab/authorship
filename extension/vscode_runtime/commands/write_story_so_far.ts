import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { authorFileEditorSession } from "../author_file_editor_session";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import { RECAP, type AuthorDocument } from "../storydoc/model";

const DOCUMENTS_THE_STORY_SO_FAR_SUMMARISES = "documents";

interface WrittenSection extends ServerJob {
    text: string;
    progress: { written: number; chapters: number };
}

function howFarAlong(section: WrittenSection): number {
    return section.progress.chapters === 0
        ? 0
        : section.progress.written / section.progress.chapters;
}

export class WriteStorySoFarCommand implements AuthorDocumentCommand {
    readonly commandName = "writeStorySoFar";
    readonly buttonGroup = "run";
    readonly iconClassName = "";
    readonly tooltip = "";
    readonly runsCellsOfKind = RECAP;

    async invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const cellId = commandArguments.cellId as string;
        const cell = document.cellWithId(cellId);
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
        const session = authorFileEditorSession(document);
        try {
            await vscode.workspace.fs.writeFile(
                document.uri,
                new TextEncoder().encode(document.text),
            );
            session?.writingCell(cellId, 0);
            const jobId = await startServerJob("/generate/recap", {
                path: document.uri.fsPath,
                documents,
            });
            const storySoFar = await awaitServerJob<WrittenSection>(
                "/generate/status",
                jobId,
                (written) => session?.writingCell(cellId, howFarAlong(written)),
            );
            document.cellWithId(cellId)?.replaceMarkdown(storySoFar.text);
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot write the story so far — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        } finally {
            session?.stopWritingCell(cellId);
        }
    }
}
