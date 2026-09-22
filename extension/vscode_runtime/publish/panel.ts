import * as vscode from "vscode";

import { fetchFromServer } from "../server/fetch";

const MILLISECONDS_BETWEEN_STATUS_POLLS = 1500;

const MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT = 10_000;

export class PublishView implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private statusPollTimer?: ReturnType<typeof setInterval>;
    private readonly whenEachJobFirstAppeared = new Map<string, number>();

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
            } else if (message?.type === "stopJob") {
                void this.stopJob(message.path as string);
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
		content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
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
