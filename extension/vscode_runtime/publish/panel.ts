import * as vscode from "vscode";

import {
    GeminiAccount,
    configuredModel,
    styleFixEnabled,
} from "../gemini/account";

const MILLISECONDS_BETWEEN_STATUS_POLLS = 1500;

const MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT = 10_000;

export class PublishView implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private statusPollTimer?: ReturnType<typeof setInterval>;

    private watchingTheAccount?: vscode.Disposable;
    private watchingTheSettings?: vscode.Disposable;

    private geminiModels?: GeminiModel[];
    private modelShippedWithAuthorship = "";

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly port: number,
        private readonly account: GeminiAccount,
    ) {}

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
                void this.showAccount();
            } else if (message?.type === "stopJob") {
                void this.stopJob(message.path as string);
            } else if (message?.type === "signInGemini") {
                void this.account.require();
            } else if (message?.type === "signOutGemini") {
                void this.account.forget();
            } else if (message?.type === "setGeminiModel") {
                void this.useGeminiModel(message.model as string);
            } else if (message?.type === "refreshGeminiModels") {
                void this.showAccount(true);
            }
        });

        this.watchingTheAccount = this.account.onDidChangeSessions(
            () => void this.showAccount(),
        );
        this.watchingTheSettings = vscode.workspace.onDidChangeConfiguration(
            (changed) => {
                if (changed.affectsConfiguration("authorship")) {
                    void this.showAccount();
                }
            },
        );

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
            this.watchingTheAccount?.dispose();
            this.watchingTheAccount = undefined;
            this.watchingTheSettings?.dispose();
            this.watchingTheSettings = undefined;
            this.view = undefined;
        });
    }

    private async showAccount(askGeminiAgain = false): Promise<void> {
        if (!this.view) {
            return;
        }
        if (!styleFixEnabled()) {
            void this.view.webview.postMessage({ type: "account", off: true });
            return;
        }
        const [session] = await this.account.getSessions();
        if (!session) {
            this.geminiModels = undefined;
        } else if (askGeminiAgain || this.geminiModels === undefined) {
            await this.readModelsThisKeyCanUse(session.accessToken);
        }
        void this.view.webview.postMessage({
            type: "account",
            account: session ? session.account.label : null,
            model: configuredModel() ?? "",
            shipped: this.modelShippedWithAuthorship,
            models: this.geminiModels ?? [],
        });
    }

    private async readModelsThisKeyCanUse(apiKey: string): Promise<void> {
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/gemini/models`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        key: apiKey,
                        model: configuredModel(),
                    }),
                    signal: AbortSignal.timeout(
                        MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT,
                    ),
                },
            );
            if (!response.ok) {
                return;
            }
            const answered = (await response.json()) as {
                default?: string;
                models?: GeminiModel[];
            };
            this.modelShippedWithAuthorship = answered.default ?? "";
            this.geminiModels = answered.models ?? [];
        } catch {}
    }

    private async useGeminiModel(model: string): Promise<void> {
        await vscode.workspace
            .getConfiguration("authorship")
            .update("gemini.model", model, vscode.ConfigurationTarget.Global);
    }

    private async pollTheServer(): Promise<void> {
        await Promise.all([
            this.showServingModels(),
            this.showMemoryInUse(),
            this.showRunningJobs(),
        ]);
    }

    private async showServingModels(): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/models`,
                {
                    signal: AbortSignal.timeout(
                        MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT,
                    ),
                },
            );
            const answered = (await response.json()) as { models: unknown };
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

    private async showMemoryInUse(): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/memory`,
                {
                    signal: AbortSignal.timeout(
                        MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT,
                    ),
                },
            );
            const memory = await response.json();
            void this.view.webview.postMessage({ type: "memory", memory });
        } catch (unanswered) {
            if (!isTimeout(unanswered)) {
                void this.view.webview.postMessage({
                    type: "memory",
                    memory: null,
                });
            }
        }
    }

    private async showRunningJobs(): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            const response = await fetch(`http://127.0.0.1:${this.port}/jobs`, {
                signal: AbortSignal.timeout(
                    MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT,
                ),
            });
            const answered = (await response.json()) as {
                jobs: {
                    kind: string;
                    path: string;
                    status: string;
                    cancelled: boolean;
                }[];
            };
            const jobs = answered.jobs.map((job) => ({
                kind: job.kind,
                path: job.path,
                name: vscode.workspace.asRelativePath(
                    vscode.Uri.file(job.path),
                ),
                status: job.status,
                cancelled: job.cancelled,
            }));
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
            await fetch(`http://127.0.0.1:${this.port}/jobs/cancel`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ path: documentPath }),
                signal: AbortSignal.timeout(
                    MILLISECONDS_BEFORE_A_STATUS_REQUEST_TIMES_OUT,
                ),
            });
        } catch {}
        await this.showRunningJobs();
    }

    private html(webview: vscode.Webview): string {
        const mediaFolder = vscode.Uri.joinPath(
            this.context.extensionUri,
            "media",
        );
        const distFolder = vscode.Uri.joinPath(
            this.context.extensionUri,
            "dist",
        );
        const script = webview.asWebviewUri(
            vscode.Uri.joinPath(distFolder, "publish_view.js"),
        );
        const style = webview.asWebviewUri(
            vscode.Uri.joinPath(mediaFolder, "publish.css"),
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
	<details class="drawer" id="account-drawer" open>
		<summary>Account</summary>
		<div class="body">
			<div id="account" class="account"></div>
		</div>
	</details>
	<details class="drawer" id="serving-status-drawer" open>
		<summary>Serving Status</summary>
		<div class="body">
			<div id="model-status" class="models"></div>
		</div>
	</details>
	<details class="drawer" id="memory-drawer" open>
		<summary>Memory</summary>
		<div class="body">
			<div id="memory" class="memory"></div>
		</div>
	</details>
	<details class="drawer" id="jobs-status-drawer" open>
		<summary>Jobs Status</summary>
		<div class="body">
			<div id="jobs-status" class="jobs"></div>
		</div>
	</details>
	<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
    }
}

interface GeminiModel {
    model: string;
    label: string;
    detail: string;
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
