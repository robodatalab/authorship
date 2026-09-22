import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { fetchFromServer } from "../server/fetch";
import type { ServerJob } from "../server/jobs";
import { geminiAccount } from "./account";

export interface GeminiServerJob extends ServerJob {
    unauthorized: boolean;
    noQuota: boolean;
}

export async function confirmSendingToGemini(
    session: AuthorFileEditorSession,
): Promise<boolean> {
    const send = "Send to Gemini";
    const answer = await vscode.window.showWarningMessage(
        `Send the prose of ${vscode.workspace.asRelativePath(session.document.uri)} to Google Gemini?`,
        {
            modal: true,
            detail:
                "Fixing style and identifying plots are the tools in Authorship " +
                "that do not run on your machine. Every section of prose is sent " +
                "over the internet to the Gemini API, on your own account, and " +
                "is billed to it.\n\n" +
                "Your notes, blurb, cover, title page and table of contents are " +
                "not sent. Nothing else Authorship does leaves this computer.",
        },
        send,
    );
    return answer === send;
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

async function offerToSignInAgain(whatTheJobDoes: string): Promise<void> {
    const account = geminiAccount();
    await account?.forget();
    const again = await vscode.window.showWarningMessage(
        `Gemini would not take the key Authorship had. Sign in again to ${whatTheJobDoes}.`,
        "Sign in",
    );
    if (again === "Sign in") {
        await account?.require();
    }
}

export async function sayWhyTheGeminiServerJobStopped(
    statusRoute: string,
    jobId: string | undefined,
    failure: unknown,
    whatTheJobDoes: string,
): Promise<void> {
    const refusal =
        failure instanceof Error ? failure.message : String(failure);
    const stopped =
        jobId === undefined
            ? undefined
            : await fetchFromServer<GeminiServerJob>(
                  `${statusRoute}?id=${encodeURIComponent(jobId)}`,
              ).catch(() => undefined);
    if (stopped?.noQuota) {
        await offerAnotherGeminiModel(refusal);
    } else if (stopped?.unauthorized) {
        await offerToSignInAgain(whatTheJobDoes);
    } else {
        void vscode.window.showErrorMessage(
            `Cannot ${whatTheJobDoes} — ${refusal}`,
        );
    }
}
