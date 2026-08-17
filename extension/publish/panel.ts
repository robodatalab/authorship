// The Authorship sidebar: a single webview view in the Authorship container,
// laid out as drawers. Story picks the manuscript every other drawer works on;
// Publishing sets its publication and exports an EPUB beside it; the rest
// report what the server is doing.
//
// The one-shot passes over a manuscript — building its representations, fixing
// its grammar, scoring a section — are not here: they act on the file being
// edited, so they are buttons in its title bar and commands in extension.ts.
//
// Everything the book says about itself — its title, its author, its blurb, the
// disclaimer it prints — lives in `<name>.authorship.md` beside the manuscript,
// as `<name>.graph.yaml` does. The author edits that file directly, so there is
// no form here to keep in step with it: Publishing is a button, and the document
// is the interface.
//
// The server owns that file. It writes the template when there is none, reads it
// when exporting, and is the one place that knows how to build the book.

import * as vscode from "vscode";

import { divideManuscript, mergeManuscript } from "../parts/divide";
import { DEFAULT_PART_WORDS, quotaOf } from "../parts/model";
import { progress, rowDescription, rowLabel } from "../search/model";
import type { ManuscriptSearch, Results } from "../search/results";
import { authorshipPathFor } from "./model";

/** Where the chosen manuscript is remembered between sessions. */
const MANUSCRIPT_KEY = "authorship.publish.manuscript";

/** How often the status drawers refresh. */
const STATUS_POLL_MS = 1500;

/** Generous, because loading weights starves the event loop for seconds. */
const STATUS_REQUEST_TIMEOUT_MS = 10_000;

export class PublishView implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    /** The manuscript being published, if one has been chosen. */
    private manuscript?: vscode.Uri;

    /** Refreshes the status drawers while the view is alive. */
    private pollTimer?: ReturnType<typeof setInterval>;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly port: number,
        private readonly search: ManuscriptSearch,
    ) {
        // Pick up where we left off, or fall back to whatever markdown is open, so
        // the panel has something to publish the first time it is shown.
        const remembered = context.workspaceState.get<string>(MANUSCRIPT_KEY);
        this.manuscript = remembered
            ? vscode.Uri.file(remembered)
            : activeMarkdown();
    }

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
            switch (message?.type) {
                case "ready":
                    void this.send();
                    // A search made before the view was ever shown, or before it was
                    // hidden and brought back, is still the search in force.
                    this.sendSearch(this.search.current());
                    break;
                case "choose":
                    void this.choose();
                    break;
                case "editAuthorship":
                    void this.editAuthorship();
                    break;
                case "divide":
                    void this.divide(quotaOf(message.words));
                    break;
                case "merge":
                    void this.merge();
                    break;
                case "export":
                    void this.export();
                    break;
                case "search":
                    void this.search.search(String(message.phrase ?? ""));
                    break;
                case "revealHit":
                    void this.search.reveal(Number(message.index));
                    break;
                case "clearSearch":
                    this.search.clear();
                    break;
            }
        });

        void this.poll();
        this.pollTimer = setInterval(() => void this.poll(), STATUS_POLL_MS);

        // The search is owned elsewhere and moves on its own — an indexing pass
        // finishing, an edit shifting the passages — so the drawer follows it
        // rather than asking.
        const following = this.search.onChange((results) =>
            this.sendSearch(results),
        );

        view.onDidDispose(() => {
            if (this.pollTimer !== undefined) {
                clearInterval(this.pollTimer);
                this.pollTimer = undefined;
            }
            following.dispose();
            this.view = undefined;
        });
    }

    // --- manuscript selection ---

    /**
     * Take the manuscript being edited, and only fall back to the file dialog
     * when there is nothing to take — the story the author means is nearly
     * always the one they are looking at.
     */
    private async choose(): Promise<void> {
        const chosen = activeMarkdown() ?? (await pickMarkdown());
        if (!chosen) {
            return;
        }
        this.manuscript = chosen;
        await this.context.workspaceState.update(
            MANUSCRIPT_KEY,
            this.manuscript.fsPath,
        );
        await this.send();
    }

    // --- authorship (<name>.authorship.md) ---

    /**
     * Open the file the book is described in, exporting first if it isn't there.
     *
     * The template is the server's to write, since it is the server that reads
     * it back — so the way to get one is to ask for the book. An author with
     * nothing written yet gets both: a book built from the defaults, and the
     * document to say something better in.
     */
    private async editAuthorship(): Promise<void> {
        if (!this.manuscript) {
            return;
        }
        const uri = authorshipUriFor(this.manuscript);
        try {
            await vscode.workspace.fs.stat(uri);
        } catch {
            await this.export();
        }
        try {
            await vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument(uri),
            );
        } catch (err) {
            await this.status(`Could not open: ${describe(err)}`, true);
        }
    }

    // --- parts (parts/part_N.md) ---

    /**
     * Cut the manuscript into parts of about the asked-for length.
     *
     * The cuts fall between sections, so a part never opens mid-scene and the
     * lengths land near the quota rather than on it. How near is worth saying: a
     * division that made three parts out of a quota meant to make ten is the
     * author's cue that their sections are longer than they thought.
     */
    private async divide(quota: number): Promise<void> {
        if (!this.manuscript) {
            return;
        }
        try {
            const { folder, parts } = await divideManuscript(
                this.manuscript,
                quota,
            );
            await this.partsStatus(
                parts === 0
                    ? "Nothing to divide — the manuscript has no prose."
                    : `Wrote ${parts} ${parts === 1 ? "part" : "parts"} to ${vscode.workspace.asRelativePath(folder)}`,
                false,
            );
        } catch (err) {
            await this.partsStatus(`Could not divide: ${describe(err)}`, true);
        }
    }

    /**
     * Put the parts back over the manuscript they were cut from.
     *
     * The writing since the division happened in the parts, so they are what
     * survives — this replaces the manuscript rather than reconciling it against
     * them. What it replaces is a file under version control, which is where an
     * author who meant something else gets it back.
     */
    private async merge(): Promise<void> {
        if (!this.manuscript) {
            return;
        }
        try {
            const { folder, parts } = await mergeManuscript(this.manuscript);
            await this.partsStatus(
                parts === 0
                    ? `Nothing to merge — no parts in ${vscode.workspace.asRelativePath(folder)}`
                    : `Merged ${parts} ${parts === 1 ? "part" : "parts"} into ${vscode.workspace.asRelativePath(this.manuscript)}`,
                false,
            );
        } catch (err) {
            await this.partsStatus(`Could not merge: ${describe(err)}`, true);
        }
    }

    // --- export ---

    private async export(): Promise<void> {
        if (!this.manuscript) {
            return;
        }
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/export/epub`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    // The manuscript is the whole request: what the book says
                    // about itself is read from the file beside it, so the panel
                    // never holds a second copy to send.
                    body: JSON.stringify({ path: this.manuscript.fsPath }),
                },
            );
            if (!response.ok) {
                await this.status(
                    `Export failed: ${await detailOf(response)}`,
                    true,
                );
                return;
            }
            const { path } = (await response.json()) as { path: string };
            // The file lands beside the manuscript and shows up in the explorer on
            // its own; opening a Finder window on top of that is just noise.
            await this.status(
                `Exported ${basename(vscode.Uri.file(path))}`,
                false,
            );
        } catch (err) {
            // The server is what builds the book; a refused connection is the likely
            // cause, and it is the one thing the author can act on.
            await this.status(
                `Export failed — is the model server running? (${describe(err)})`,
                true,
            );
        }
    }

    // --- search ---

    /**
     * Hand the drawer the search as it stands.
     *
     * The rows are built here rather than in the view: what a row says about a
     * passage is the same question whichever way it is displayed, and it is
     * answered in search/model.ts where it can be read without a webview.
     */
    private sendSearch(results: Results | null): void {
        void this.view?.webview.postMessage({
            type: "search",
            search: results && {
                manuscript: results.manuscript,
                phrase: results.phrase,
                searching: results.searching,
                error: results.error,
                progress: progress(results.pending),
                hits: results.hits.map((hit) => ({
                    label: rowLabel(hit),
                    where: rowDescription(hit),
                    text: hit.text,
                })),
            },
        });
    }

    // --- view plumbing ---

    /** Read the files and hand the whole state to the view. */
    private async send(): Promise<void> {
        if (!this.view) {
            return;
        }
        await this.view.webview.postMessage({
            type: "state",
            // Shown root-relative, so a story nested in the workspace reads as its
            // path rather than a bare filename shared with every other story.md.
            manuscript: this.manuscript
                ? vscode.workspace.asRelativePath(this.manuscript)
                : null,
            wordsPerPart: await this.wordsPerPart(),
        });
    }

    /**
     * The quota the authorship file records, or the default while the server is
     * not there to read it — a division the author asks for is worth doing on a
     * sensible number rather than refusing over a status endpoint.
     */
    private async wordsPerPart(): Promise<number> {
        if (!this.manuscript) {
            return DEFAULT_PART_WORDS;
        }
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/authorship?path=${encodeURIComponent(
                    this.manuscript.fsPath,
                )}`,
                { signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS) },
            );
            const body = (await response.json()) as { wordsPerPart?: unknown };
            return quotaOf(body.wordsPerPart);
        } catch {
            return DEFAULT_PART_WORDS;
        }
    }

    /** A status line under the Publishing drawer, which is what raises them. */
    private async status(message: string, error: boolean): Promise<void> {
        await this.view?.webview.postMessage({
            type: "status",
            message,
            error,
        });
    }

    /** The same, under the Parts drawer — a division says nothing about an export. */
    private async partsStatus(message: string, error: boolean): Promise<void> {
        await this.view?.webview.postMessage({
            type: "partsStatus",
            message,
            error,
        });
    }

    /** Repaint the status drawers from the server. */
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
                jobs: { kind: string; path: string; status: string }[];
            };
            const jobs = body.jobs.map((job) => ({
                kind: job.kind,
                // Shown root-relative, like the manuscript name: the panel is narrow,
                // and the end of the path is the part that names the file.
                path: vscode.workspace.asRelativePath(
                    vscode.Uri.file(job.path),
                ),
                status: job.status,
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
	<title>Publish</title>
</head>
<body>
	<details class="drawer" id="story" open>
		<summary>Story</summary>
		<div class="body">
			<div class="manuscript">
				<span id="manuscript-name" class="name">No story selected</span>
				<button id="choose" type="button">Choose…</button>
			</div>
		</div>
	</details>
	<details class="drawer" id="parts" open>
		<summary>Parts</summary>
		<div class="body">
			<label>Words per part
				<input id="f-part-words" type="number" min="1" step="100">
			</label>
			<div class="actions">
				<button id="divide" type="button">Partition</button>
				<button id="merge" type="button"
					title="Put the parts back over the manuscript, replacing it">Merge</button>
			</div>
			<div id="parts-status" class="status" hidden></div>
		</div>
	</details>
	<details class="drawer" id="publishing" open>
		<summary>Publishing</summary>
		<div class="body">
			<div class="actions">
				<button id="export" type="button" class="primary">Export as EPUB</button>
				<button id="edit-authorship" type="button"
					title="Subtitle, author, cover, blurb, disclaimer — everything but the title, which the manuscript names">Edit details…</button>
			</div>
			<div id="status" class="status" hidden></div>
		</div>
	</details>
	<details class="drawer" id="search-drawer" open>
		<summary>Search</summary>
		<div class="body">
			<div class="search-ask">
				<input id="search-phrase" type="text"
					placeholder="Describe what you are looking for">
				<button id="search-clear" type="button" title="Put the answer away" hidden>Clear</button>
			</div>
			<div id="search-note" class="status" hidden></div>
			<div id="search-hits" class="hits"></div>
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

/** The markdown file in the active editor, if that is what is open. */
function activeMarkdown(): vscode.Uri | undefined {
    const active = vscode.window.activeTextEditor;
    if (
        active?.document.languageId === "markdown" &&
        active.document.uri.scheme === "file"
    ) {
        return active.document.uri;
    }
    return undefined;
}

async function pickMarkdown(): Promise<vscode.Uri | undefined> {
    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Select story",
        filters: { Markdown: ["md"] },
    });
    return picked?.[0];
}

async function detailOf(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { detail?: string };
        return body.detail ?? response.statusText;
    } catch {
        return response.statusText;
    }
}

/** The authorship file lives beside the manuscript; model.ts knows its name. */
function authorshipUriFor(md: vscode.Uri): vscode.Uri {
    return md.with({ path: authorshipPathFor(md.path) });
}

function basename(uri: vscode.Uri): string {
    return uri.path.split("/").pop() ?? uri.path;
}

function describe(err: unknown): string {
    const message = (err as { message?: unknown } | null)?.message;
    return typeof message === "string" ? message : String(err);
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
