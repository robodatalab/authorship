// The Authorship sidebar: what the machinery behind the editor is doing.
//
// It used to be where a book was assembled. It is not any more — a story and the
// layout it publishes in are one `.author` document now, and the editor for that
// document is where the author works. What is left here is the part that was
// never about a particular book: which models are resident, what they are
// holding, and what work the server has in hand.
//
// So this owns no files and edits nothing. It polls, and it draws what it hears.

import * as vscode from "vscode";

/** How often the drawers refresh. */
const STATUS_POLL_MS = 1500;

/** Generous, because loading weights starves the event loop for seconds. */
const STATUS_REQUEST_TIMEOUT_MS = 10_000;

export class PublishView implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private pollTimer?: ReturnType<typeof setInterval>;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly port: number,
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
            } else if (message?.type === "stopJob") {
                void this.stopJob(message.path as string);
            }
        });

        void this.poll();
        this.pollTimer = setInterval(() => void this.poll(), STATUS_POLL_MS);

        view.onDidDispose(() => {
            if (this.pollTimer !== undefined) {
                clearInterval(this.pollTimer);
                this.pollTimer = undefined;
            }
            this.view = undefined;
        });
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
