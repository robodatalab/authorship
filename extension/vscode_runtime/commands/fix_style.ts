import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import {
    configuredModel,
    geminiAccount,
    styleFixEnabled,
} from "../gemini/account";
import { fetchFromServer } from "../server/fetch";
import { awaitServerJob, startServerJob, type ServerJob } from "../server/jobs";
import { MARKDOWN, type ImmutableAuthorDocument } from "../storydoc/model";

const STYLE_FIX_STATUS = "/fix/style/status";

interface CorrectedSection {
    cellId: string;
    source: string;
}

interface ChapterLeftAlone {
    chapter: string;
    why: string;
}

interface StyleFixJob extends ServerJob {
    unauthorized: boolean;
    noQuota: boolean;
    leftAlone: ChapterLeftAlone[];
    sections: CorrectedSection[];
}

async function confirmSendingToGemini(
    session: AuthorFileEditorSession,
): Promise<boolean> {
    const send = "Send to Gemini";
    const answer = await vscode.window.showWarningMessage(
        `Send the chapters of ${vscode.workspace.asRelativePath(session.document.uri)} to Google Gemini?`,
        {
            modal: true,
            detail:
                "Fixing style and grammar is the one tool in Authorship that does " +
                "not run on your machine. The chapter titles and the prose written " +
                "under them are sent over the internet to the Gemini API, on your " +
                "own account, and are billed to it.\n\n" +
                "Your notes, blurb, cover, title page and table of contents are " +
                "not sent. Nothing else Authorship does leaves this computer.",
        },
        send,
    );
    return answer === send;
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

function sayWhichChaptersWereLeftAlone(leftAlone: ChapterLeftAlone[]): void {
    if (leftAlone.length === 0) {
        return;
    }
    const named = leftAlone
        .map((left) => `“${left.chapter}” — ${left.why}`)
        .join("; ");
    void vscode.window.showWarningMessage(
        leftAlone.length === 1
            ? `One chapter was left as you wrote it: ${named}`
            : `${leftAlone.length} chapters were left as you wrote them: ${named}`,
    );
}

async function offerAnotherGeminiModel(refusal: string): Promise<void> {
    const chose = await vscode.window.showWarningMessage(
        refusal,
        "Choose a model",
    );
    if (chose === "Choose a model") {
        await vscode.commands.executeCommand("authorship.gemini.chooseModel");
    }
}

async function offerToSignInAgain(): Promise<void> {
    const account = geminiAccount();
    await account?.forget();
    const again = await vscode.window.showWarningMessage(
        "Gemini would not take the key Authorship had. Sign in again to correct the style.",
        "Sign in",
    );
    if (again === "Sign in") {
        await account?.require();
    }
}

async function sayWhyThePassStopped(
    jobId: string | undefined,
    failure: unknown,
): Promise<void> {
    const refusal =
        failure instanceof Error ? failure.message : String(failure);
    const stopped =
        jobId === undefined
            ? undefined
            : await fetchFromServer<StyleFixJob>(
                  `${STYLE_FIX_STATUS}?id=${encodeURIComponent(jobId)}`,
              ).catch(() => undefined);
    if (stopped?.noQuota) {
        await offerAnotherGeminiModel(refusal);
    } else if (stopped?.unauthorized) {
        await offerToSignInAgain();
    } else {
        void vscode.window.showErrorMessage(
            `Cannot fix the style — ${refusal}`,
        );
    }
}

export class FixStyleCommand implements AuthorDocumentCommand {
    readonly commandName = "fixStyle";
    readonly buttonGroup = "check";
    readonly tooltip =
        "Fix Style and Grammar — send every chapter to Google Gemini to be copy-edited";

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
        await session.writeTheDocumentToItsFile();
        let jobId: string | undefined;
        try {
            jobId = await startServerJob("/fix/style", {
                path: session.document.uri.fsPath,
                key: apiKey,
                model: configuredModel(),
            });
            const pass = await awaitServerJob<StyleFixJob>(
                STYLE_FIX_STATUS,
                jobId,
                (sofar) => putCorrectedSectionsIn(session, sofar.sections),
            );
            putCorrectedSectionsIn(session, pass.sections);
            sayWhichChaptersWereLeftAlone(pass.leftAlone);
        } catch (failure) {
            await sayWhyThePassStopped(jobId, failure);
        }
    }
}
