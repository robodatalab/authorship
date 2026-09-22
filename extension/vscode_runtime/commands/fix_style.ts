import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import {
    configuredModel,
    geminiAccount,
    styleFixEnabled,
} from "../gemini/account";
import {
    confirmSendingToGemini,
    sayWhyTheGeminiServerJobStopped,
    type GeminiServerJob,
} from "../gemini/gemini_server_job";
import { awaitServerJob, startServerJob } from "../server/jobs";
import { MARKDOWN, type ImmutableAuthorDocument } from "../storydoc/model";

const STYLE_FIX_STATUS = "/fix/style/status";

interface CorrectedSection {
    cellId: string;
    source: string;
}

interface SectionLeftAlone {
    opening: string;
    why: string;
}

interface StyleFixJob extends GeminiServerJob {
    leftAlone: SectionLeftAlone[];
    sections: CorrectedSection[];
}

function putCorrectedSectionsIn(
    session: AuthorFileEditorSession,
    corrected: CorrectedSection[],
): void {
    let anySectionChanged = false;
    session.changeTheDocument((story) => {
        for (const { cellId, source } of corrected) {
            const cell = story.cellWithId(cellId);
            if (cell?.kind === MARKDOWN && cell.source !== source) {
                cell.replaceMarkdown(source);
                anySectionChanged = true;
            }
        }
    });
    if (anySectionChanged) {
        session.sendDocument();
    }
}

function sayWhichSectionsWereLeftAlone(leftAlone: SectionLeftAlone[]): void {
    if (leftAlone.length === 0) {
        return;
    }
    const named = leftAlone
        .map((left) => `“${left.opening}…” — ${left.why}`)
        .join("; ");
    void vscode.window.showWarningMessage(
        leftAlone.length === 1
            ? `One section was left as you wrote it: ${named}`
            : `${leftAlone.length} sections were left as you wrote them: ${named}`,
    );
}

export class FixStyleCommand implements AuthorDocumentCommand {
    readonly commandName = "fixStyle";
    readonly buttonGroup = "check";
    readonly tooltip =
        "Fix Style and Grammar — send every section to Google Gemini to be copy-edited";

    get iconClassName(): string {
        return styleFixEnabled() ? "codicon codicon-sparkle" : "";
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        if (!styleFixEnabled()) {
            return;
        }
        const apiKey = await geminiAccount()?.require();
        if (!apiKey) {
            return;
        }
        if (!(await confirmSendingToGemini(session))) {
            return;
        }
        let jobId: string | undefined;
        try {
            jobId = await startServerJob("/fix/style", {
                path: session.document.uri.fsPath,
                text: session.document.text,
                key: apiKey,
                model: configuredModel(),
            });
            const pass = await awaitServerJob<StyleFixJob>(
                STYLE_FIX_STATUS,
                jobId,
                (sofar) => putCorrectedSectionsIn(session, sofar.sections),
            );
            putCorrectedSectionsIn(session, pass.sections);
            sayWhichSectionsWereLeftAlone(pass.leftAlone);
        } catch (failure) {
            await sayWhyTheGeminiServerJobStopped(
                STYLE_FIX_STATUS,
                jobId,
                failure,
                "fix the style",
            );
        }
    }
}
