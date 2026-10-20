import * as vscode from "vscode";

import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { authorDocumentCommand } from "../commands/author_document_commands";
import { fetchFromServer } from "../server/fetch";

const MILLISECONDS_BETWEEN_STATUS_POLLS = 1500;

const MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT = 10_000;

export class PublishView implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private statusPollTimer?: ReturnType<typeof setInterval>;
    private readonly whenEachJobFirstAppeared = new Map<string, number>();
    private sessionFollowed?: AuthorFileEditorSession;
    private followingTheSession?: vscode.Disposable;

    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, "media"),
                vscode.Uri.joinPath(this.context.extensionUri, "dist"),
            ],
        };
        view.webview.html = this.html(view.webview);

        view.webview.onDidReceiveMessage((message) => {
            if (message?.type === "ready") {
                void this.pollTheServer();
                this.showTheDocument();
            } else if (message?.type === "stopJob") {
                void this.stopJob(message.path as string);
            } else if (message?.type === "selectStoryAnnotation") {
                this.sessionFollowed?.selectTheStoryAnnotation(
                    message.cellKind as string,
                    message.annotationCellId as string | null,
                );
            } else if (message?.type === "selectPassage") {
                this.sessionFollowed?.selectThePassage(
                    message.cellKind as string,
                    message.passage as number | null,
                );
            } else if (message?.type === "typed") {
                this.sessionFollowed?.theAuthorTypedInTheCell(
                    message.cellId as string,
                    message.markdown as string,
                );
            } else if (message?.type === "showStoryWordRange") {
                this.sessionFollowed?.showTheStoryWordRange({
                    firstWord: message.firstWord as number,
                    lastWord: message.lastWord as number,
                });
            } else if (message?.type === "invoke" && this.sessionFollowed) {
                void authorDocumentCommand(
                    message.commandName as string,
                )?.invoke(
                    this.sessionFollowed,
                    message.commandArguments as Record<string, unknown>,
                );
            }
        });

        void this.pollTheServer();
        this.statusPollTimer = setInterval(
            () => void this.pollTheServer(),
            MILLISECONDS_BETWEEN_STATUS_POLLS,
        );

        view.onDidDispose(() => {
            if (this.statusPollTimer !== undefined) {
                clearInterval(this.statusPollTimer);
                this.statusPollTimer = undefined;
            }
            this.view = undefined;
        });
    }

    follow(session: AuthorFileEditorSession): void {
        if (this.sessionFollowed === session) {
            return;
        }
        this.followingTheSession?.dispose();
        this.sessionFollowed = session;
        this.followingTheSession = vscode.Disposable.from(
            session.onDocumentOrSelectionChanged(() =>
                this.showTheDocument(),
            ),
        );
        this.showTheDocument();
    }

    stopFollowing(session: AuthorFileEditorSession): void {
        if (this.sessionFollowed !== session) {
            return;
        }
        this.followingTheSession?.dispose();
        this.followingTheSession = undefined;
        this.sessionFollowed = undefined;
        this.showTheDocument();
    }

    private showTheDocument(): void {
        const session = this.sessionFollowed;
        void this.view?.webview.postMessage({
            type: "document",
            text: session?.document.text ?? null,
            storyAnnotationsSelected: session?.theStoryAnnotationsSelected ?? {},
            storyTextSelected: session?.theStoryTextSelected ?? null,
        });
    }

    private async pollTheServer(): Promise<void> {
        await Promise.all([
            this.showServingModels(),
            this.showRunningJobs(),
        ]);
    }

    private async showServingModels(): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            const answered = await fetchFromServer<{ models: unknown }>(
                "/models",
                undefined,
                MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT,
            );
            void this.view.webview.postMessage({
                type: "models",
                models: answered.models,
            });
        } catch (unanswered) {
            if (!isTimeout(unanswered)) {
                void this.view.webview.postMessage({
                    type: "models",
                    models: null,
                });
            }
        }
    }

    private secondsSinceTheJobFirstAppeared(documentPath: string): number {
        const firstAppearedAt =
            this.whenEachJobFirstAppeared.get(documentPath) ?? Date.now();
        this.whenEachJobFirstAppeared.set(documentPath, firstAppearedAt);
        return Math.round((Date.now() - firstAppearedAt) / 1000);
    }

    private forgetJobsThatAreOver(documentPathsStillQueued: string[]): void {
        for (const documentPath of this.whenEachJobFirstAppeared.keys()) {
            if (!documentPathsStillQueued.includes(documentPath)) {
                this.whenEachJobFirstAppeared.delete(documentPath);
            }
        }
    }

    private async showRunningJobs(): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            const answered = await fetchFromServer<{
                jobs: {
                    kind: string;
                    path: string;
                    status: string;
                    cancelled: boolean;
                }[];
            }>(
                "/jobs",
                undefined,
                MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT,
            );
            const jobs = answered.jobs.map((job) => ({
                kind: job.kind,
                path: job.path,
                name: vscode.workspace.asRelativePath(
                    vscode.Uri.file(job.path),
                ),
                status: job.status,
                cancelled: job.cancelled,
                secondsRunning: this.secondsSinceTheJobFirstAppeared(job.path),
            }));
            this.forgetJobsThatAreOver(answered.jobs.map((job) => job.path));
            void this.view.webview.postMessage({ type: "jobs", jobs });
        } catch (unanswered) {
            if (!isTimeout(unanswered)) {
                void this.view.webview.postMessage({
                    type: "jobs",
                    jobs: null,
                });
            }
        }
    }

    private async stopJob(documentPath: string): Promise<void> {
        try {
            await fetchFromServer(
                "/jobs/cancel",
                { path: documentPath },
                MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT,
            );
        } catch {}
        await this.showRunningJobs();
    }

    private html(webview: vscode.Webview): string {
        const distFolder = vscode.Uri.joinPath(
            this.context.extensionUri,
            "dist",
        );
        const script = webview.asWebviewUri(
            vscode.Uri.joinPath(distFolder, "publish_view.js"),
        );
        const style = webview.asWebviewUri(
            vscode.Uri.joinPath(distFolder, "publish_view.css"),
        );
        const nonce = scriptNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${style}" rel="stylesheet">
	<title>Authorship</title>
</head>
<body>
	<div id="authorship-panel-root"></div>
	<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
    }
}

function isTimeout(failure: unknown): boolean {
    return failure instanceof Error && failure.name === "TimeoutError";
}

function scriptNonce(): string {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let character = 0; character < 32; character++) {
        nonce += characters.charAt(
            Math.floor(Math.random() * characters.length),
        );
    }
    return nonce;
}
