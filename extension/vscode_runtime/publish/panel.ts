import * as vscode from "vscode";

import {
    GeminiAccount,
    configuredModel,
    styleFixEnabled,
} from "../gemini/account";

const STATUS_POLL_MS = 1500;

const STATUS_REQUEST_TIMEOUT_MS = 10_000;

export class PublishView implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private pollTimer?: ReturnType<typeof setInterval>;

    private watching?: vscode.Disposable;
    private settings?: vscode.Disposable;

    private models?: GeminiModel[];
    private shipped = "";

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
                void this.poll();
                void this.showAccount();
            } else if (message?.type === "stopJob") {
                void this.stopJob(message.path as string);
            } else if (message?.type === "signInGemini") {
                void this.account.require();
            } else if (message?.type === "signOutGemini") {
                void this.account.forget();
            } else if (message?.type === "setGeminiModel") {
                void this.setModel(message.model as string);
            } else if (message?.type === "refreshGeminiModels") {
                void this.showAccount(true);
            }
        });

        this.watching = this.account.onDidChangeSessions(
            () => void this.showAccount(),
        );
        this.settings = vscode.workspace.onDidChangeConfiguration((changed) => {
            if (changed.affectsConfiguration("authorship")) {
                void this.showAccount();
            }
        });

        void this.poll();
        this.pollTimer = setInterval(() => void this.poll(), STATUS_POLL_MS);

        view.onDidDispose(() => {
            if (this.pollTimer !== undefined) {
                clearInterval(this.pollTimer);
                this.pollTimer = undefined;
            }
            this.watching?.dispose();
            this.watching = undefined;
            this.settings?.dispose();
            this.settings = undefined;
            this.view = undefined;
        });
    }

    private async showAccount(refresh = false): Promise<void> {
        if (!this.view) {
            return;
        }
        if (!styleFixEnabled()) {
            void this.view.webview.postMessage({ type: "account", off: true });
            return;
        }
        const [session] = await this.account.getSessions();
        if (!session) {
            this.models = undefined;
        } else if (refresh || this.models === undefined) {
            await this.loadModels(session.accessToken);
        }
        void this.view.webview.postMessage({
            type: "account",
            account: session ? session.account.label : null,
            model: configuredModel() ?? "",
            shipped: this.shipped,
            models: this.models ?? [],
        });
    }

    private async loadModels(key: string): Promise<void> {
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/gemini/models`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ key, model: configuredModel() }),
                    signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
                },
            );
            if (!response.ok) {
                return;
            }
            const body = (await response.json()) as {
                default?: string;
                models?: GeminiModel[];
            };
            this.shipped = body.default ?? "";
            this.models = body.models ?? [];
        } catch {}
    }

    private async setModel(model: string): Promise<void> {
        await vscode.workspace
            .getConfiguration("authorship")
            .update("gemini.model", model, vscode.ConfigurationTarget.Global);
    }

    private async poll(): Promise<void> {
        await Promise.all([
            this.pollModels(),
            this.pollMemory(),
            this.pollJobs(),
        ]);
    }

    private async pollModels(): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/models`,
                {
                    signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
                },
            );
            const body = (await response.json()) as { models: unknown };
            void this.view.webview.postMessage({
                type: "models",
                models: body.models,
            });
        } catch (err) {
            if (!isTimeout(err)) {
                void this.view.webview.postMessage({
                    type: "models",
                    models: null,
                });
            }
        }
    }

    private async pollMemory(): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/memory`,
                {
                    signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
                },
            );
            const memory = await response.json();
            void this.view.webview.postMessage({ type: "memory", memory });
        } catch (err) {
            if (!isTimeout(err)) {
                void this.view.webview.postMessage({
                    type: "memory",
                    memory: null,
                });
            }
        }
    }

    private async pollJobs(): Promise<void> {
        if (!this.view) {
            return;
        }
        try {
            const response = await fetch(`http://127.0.0.1:${this.port}/jobs`, {
                signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
            });
            const body = (await response.json()) as {
                jobs: {
                    kind: string;
                    path: string;
                    status: string;
                    cancelled: boolean;
                }[];
            };
            const jobs = body.jobs.map((job) => ({
                kind: job.kind,
                path: job.path,
                name: vscode.workspace.asRelativePath(
                    vscode.Uri.file(job.path),
                ),
                status: job.status,
                cancelled: job.cancelled,
            }));
            void this.view.webview.postMessage({ type: "jobs", jobs });
        } catch (err) {
            if (!isTimeout(err)) {
                void this.view.webview.postMessage({
                    type: "jobs",
                    jobs: null,
                });
            }
        }
    }

    private async stopJob(path: string): Promise<void> {
        try {
            await fetch(`http://127.0.0.1:${this.port}/jobs/cancel`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ path }),
                signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
            });
        } catch {}
        await this.pollJobs();
    }

    private html(webview: vscode.Webview): string {
        const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
        const dist = vscode.Uri.joinPath(this.context.extensionUri, "dist");
        const script = webview.asWebviewUri(
            vscode.Uri.joinPath(dist, "publish_view.js"),
        );
        const style = webview.asWebviewUri(
            vscode.Uri.joinPath(media, "publish.css"),
        );
        const nonce = nonceString();

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

function isTimeout(err: unknown): boolean {
    return err instanceof Error && err.name === "TimeoutError";
}

function nonceString(): string {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < 32; i++) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}
