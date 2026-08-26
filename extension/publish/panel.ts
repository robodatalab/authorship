// The Authorship sidebar: what the machinery behind the editor is doing.
//
// It used to be where a book was assembled. It is not any more — a story and the
// layout it publishes in are one `.author` document now, and the editor for that
// document is where the author works. What is left here is the part that was
// never about a particular book: which models are resident, what they are
// holding, and what work the server has in hand.
//
// So this owns no files and edits nothing. It polls, and it draws what it hears —
// with one exception. The Gemini account is here too, at the top, because this
// drawer is already the answer to "what can Authorship reach, and what state is
// it in", and an account that sends the manuscript off this machine is the most
// important entry that question has. VS Code's own Accounts menu lists a session
// once there is one, which is no help at all to somebody looking for where to
// make one.

import * as vscode from "vscode";

import { GeminiAccount, configuredModel } from "../gemini/account";

/** How often the drawers refresh. */
const STATUS_POLL_MS = 1500;

/** Generous, because loading weights starves the event loop for seconds. */
const STATUS_REQUEST_TIMEOUT_MS = 10_000;

export class PublishView implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private pollTimer?: ReturnType<typeof setInterval>;

    private watching?: vscode.Disposable;
    private settings?: vscode.Disposable;

    /**
     * The models this key can reach, once they have been asked for.
     *
     * Held for as long as the panel is, because the list is a question for
     * Google and the drawer is repainted whenever anything about the account
     * changes — including changing which model is chosen, which is no reason to
     * ask again. Dropped on signing out, since the next key may see other models.
     */
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

        // The account is news rather than a reading, so it is not polled: signing
        // in or out says so, and nothing else changes it.
        this.watching = this.account.onDidChangeSessions(
            () => void this.showAccount(),
        );
        // The model can also be changed from the settings editor or the command,
        // and a dropdown showing something other than the truth is worse than no
        // dropdown at all.
        this.settings = vscode.workspace.onDidChangeConfiguration((changed) => {
            if (changed.affectsConfiguration("authorship.gemini.model")) {
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

    /**
     * Say whether there is a Gemini account, and what it is called.
     *
     * The key itself never leaves the host: what the drawer is told is the label
     * VS Code would show, which is the masked tail and nothing more.
     */
    private async showAccount(refresh = false): Promise<void> {
        if (!this.view) {
            return;
        }
        const [session] = await this.account.getSessions();
        if (!session) {
            // The next key may not see the same models.
            this.models = undefined;
        } else if (refresh || this.models === undefined) {
            await this.loadModels(session.accessToken);
        }
        void this.view.webview.postMessage({
            type: "account",
            account: session ? session.account.label : null,
            // What the setting holds; empty is "whichever one Authorship ships
            // with", which is a choice and not the absence of one.
            model: configuredModel() ?? "",
            shipped: this.shipped,
            models: this.models ?? [],
        });
    }

    /**
     * Ask which models this key can write with.
     *
     * Failure is quiet. The drawer draws the dropdown from whatever it has, and
     * a server that is still starting up is not worth a dialog over — the list
     * fills in the next time the account is looked at.
     */
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
        } catch {
            // Said by the offline notice beside this, if it is that.
        }
    }

    /** Remember which Gemini to use. Empty is back to the one we ship with. */
    private async setModel(model: string): Promise<void> {
        await vscode.workspace
            .getConfiguration("authorship")
            .update(
                "gemini.model",
                model,
                vscode.ConfigurationTarget.Global,
            );
    }

    private async poll(): Promise<void> {
        await Promise.all([
            this.pollModels(),
            this.pollMemory(),
            this.pollJobs(),
        ]);
    }

    /** Poll the server for what is loaded, and paint the Serving Status drawer. */
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
            // A timeout means the server is busy loading, not gone — leave the last
            // reading up. Only a refused connection reads as offline.
            if (!isTimeout(err)) {
                void this.view.webview.postMessage({
                    type: "models",
                    models: null,
                });
            }
        }
    }

    /** Poll what the model is holding, and paint the Memory drawer. */
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

    /** Poll the server for the work it has in hand, and paint the Jobs Status drawer. */
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
                // The path the server keys the job by, which is what stopping one
                // has to name. Shown root-relative beside it: the panel is narrow,
                // and the end of a path is the part that says which file it is.
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
                void this.view.webview.postMessage({ type: "jobs", jobs: null });
            }
        }
    }

    /**
     * Ask the server to stop a job, and repaint the drawer on the click rather
     * than at the next tick.
     *
     * A job that finished between the click and this is no failure — what was
     * asked for is a job that is not running, and there is not one. Either way
     * what the drawer then shows is what the server says now.
     */
    private async stopJob(path: string): Promise<void> {
        try {
            await fetch(`http://127.0.0.1:${this.port}/jobs/cancel`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ path }),
                signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
            });
        } catch {
            // A server that cannot be reached is already said so by the polling
            // beside this; there is nothing here to tell the author twice.
        }
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

/** One Gemini the account can write with, as the drawer lists it. */
interface GeminiModel {
    model: string;
    label: string;
    detail: string;
}

/** `AbortSignal.timeout` rejects with a `TimeoutError`; a refused connection does not. */
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
