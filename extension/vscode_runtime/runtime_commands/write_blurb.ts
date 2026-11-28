import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { RuntimeCommand } from "./runtime_command";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import { BLURB } from "authordoc/cells/blurb_cell";

interface WrittenSection extends ServerJob {
    text: string;
    progress: { written: number; chapters: number };
}

function howFarAlong(section: WrittenSection): number {
    return section.progress.chapters === 0
        ? 0
        : section.progress.written / section.progress.chapters;
}

export const WRITE_BLURB = "writeBlurb";

export class WriteBlurbCommand implements RuntimeCommand {
    constructor(private readonly cellId: string) {}

    static deserialize(serialized: Record<string, unknown>): WriteBlurbCommand {
        const cellId = serialized.cellId as string;
        const command = new WriteBlurbCommand(cellId);
        return command;
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const cell = session.document.cellWithId(this.cellId);
        if (!cell) {
            return;
        }

        try {
            session?.writingCell(this.cellId, 0);
            const jobId = await startServerJob("/generate/blurb", {
                path: session.document.path,
                text: session.document.text,
            });
            const blurb = await awaitServerJob<WrittenSection>(
                "/generate/blurb/status",
                jobId,
                (written) =>
                    session?.writingCell(this.cellId, howFarAlong(written)),
            );
            session?.changeTheDocument((story) => {
                const cell = story.cellWithId(this.cellId);
                if (!cell) {
                    return story;
                }
                const cellRewritten = cell.withSource(blurb.text);
                const storyChanged = story.withCell(cellRewritten);
                return storyChanged;
            });
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot write the blurb — is the server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
        } finally {
            session?.stopWritingCell(this.cellId);
        }
    }
}
