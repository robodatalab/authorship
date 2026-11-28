import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { RuntimeCommand } from "./runtime_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import { RECAP, RecapCell } from "authordoc/cells/recap_cell";

interface WrittenSection extends ServerJob {
    text: string;
    progress: { written: number; chapters: number };
}

function howFarAlong(section: WrittenSection): number {
    return section.progress.chapters === 0
        ? 0
        : section.progress.written / section.progress.chapters;
}

export const WRITE_STORY_SO_FAR = "writeStorySoFar";

export class WriteStorySoFarCommand implements RuntimeCommand {
    constructor(private readonly cellId: string) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): WriteStorySoFarCommand {
        const cellId = serialized.cellId as string;
        const command = new WriteStorySoFarCommand(cellId);
        return command;
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const cell = session.document.cellWithId(this.cellId);
        if (!(cell instanceof RecapCell)) {
            return;
        }
        const documents = cell.documents
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
            session?.writingCell(this.cellId, 0);
            const jobId = await startServerJob("/generate/recap", {
                path: session.document.path,
                text: session.document.text,
                documents,
            });
            const storySoFar = await awaitServerJob<WrittenSection>(
                "/generate/recap/status",
                jobId,
                (written) =>
                    session?.writingCell(this.cellId, howFarAlong(written)),
            );
            session?.changeTheDocument((story) => {
                const cell = story.cellWithId(this.cellId);
                if (!cell) {
                    return story;
                }
                const cellRewritten = cell.withSource(storySoFar.text);
                const storyChanged = story.withCell(cellRewritten);
                return storyChanged;
            });
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot write the story so far — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        } finally {
            session?.stopWritingCell(this.cellId);
        }
    }
}
