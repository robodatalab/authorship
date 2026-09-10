import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import { BLURB, type ImmutableAuthorDocument } from "../storydoc/model";

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
    readonly runsCellsOfKind = BLURB;

    async invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const cellId = commandArguments.cellId as string;
        const cell = session.document.cellWithId(cellId);
        if (!cell) {
            return;
        }

        try {
            await vscode.workspace.fs.writeFile(
                session.document.uri,
                new TextEncoder().encode(session.document.text),
            );
            session?.writingCell(cellId, 0);
            const jobId = await startServerJob("/generate/blurb", {
                path: session.document.uri.fsPath,
            });
            const blurb = await awaitServerJob<WrittenSection>(
                "/generate/status",
                jobId,
                (written) => session?.writingCell(cellId, howFarAlong(written)),
            );
            session?.changeTheDocument((story) =>
                story.cellWithId(cellId)?.replaceMarkdown(blurb.text),
            );
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot write the blurb — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        } finally {
            session?.stopWritingCell(cellId);
        }
    }
}
