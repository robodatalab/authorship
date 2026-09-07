import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { authorFileEditorSession } from "../author_file_editor_session";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import type { AuthorDocument } from "../storydoc/model";

interface WrittenSection extends ServerJob {
    text: string;
    progress: { written: number; chapters: number };
}

function howFarAlong(section: WrittenSection): number {
    return section.progress.chapters === 0
        ? 0
        : section.progress.written / section.progress.chapters;
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
        const session = authorFileEditorSession(document);
        try {
            await vscode.workspace.fs.writeFile(
                document.uri,
                new TextEncoder().encode(document.text),
            );
            session?.writingCell(cell.uniqueId, 0);
            const jobId = await startServerJob("/generate/blurb", {
                path: document.uri.fsPath,
            });
            const blurb = await awaitServerJob<WrittenSection>(
                "/generate/status",
                jobId,
                (written) =>
                    session?.writingCell(cell.uniqueId, howFarAlong(written)),
            );
            cell.replaceMarkdown(blurb.text);
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot write the blurb — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        } finally {
            session?.stopWritingCell(cell.uniqueId);
        }
    }
}
