// The editor a `.author` file opens in: cells, the way a notebook has cells.
//
// It is a *text* editor provider rather than a binary one, and that is the whole
// design. The document VS Code holds is the file itself — so undo, redo, dirty
// state, Save All, git diffs and "Reopen Editor With… › Text Editor" all work
// without this module doing anything about them. The webview is a view of the
// text, not a second copy of it.
//
// Edits travel one way: the view says what it did, this applies it to the
// document as a WorkspaceEdit, and the document change comes back and repaints
// the view. Nothing here holds cells of its own between edits.

import * as vscode from 'vscode';

import { compile, fromMarkdown, toMarkdown } from './model';
import { BODY } from './page';

/** How often a running job is asked whether it has finished. */
const JOB_POLL_MS = 400;

/**
 * How many polls in a row may go unanswered before the wait is given up on.
 *
 * A job runs on the server and outlives any one question put to it, so a poll
 * that fails is a poll, not a job — giving up on the first one abandons work
 * that is still being done, in the one place the author cannot see it.
 */
const POLLS_UNANSWERED = 5;

/**
 * How long a job that cannot say how it is getting on is waited for.
 *
 * Long enough for a model that has to load first, short enough to give up. A job
 * that reports its progress is never given up on — the author can watch it move
 * and has a button to stop it, which is better than a clock nobody set.
 */
const JOB_TIMEOUT_MS = 180_000;

import { divideManuscript } from '../parts/divide';
import { DEFAULT_PART_WORDS, quotaOf } from '../parts/model';
import { PART, dumps, has, parse, type Cell } from '../storydoc/model';

export class AuthorEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'authorship.authorEditor';

	/**
	 * The editor the title-bar buttons act on.
	 *
	 * The toolbar is VS Code's own — commands in `contributes.menus`, drawn by
	 * the workbench with its own icons, tooltips and overflow — so the buttons
	 * arrive here knowing nothing about which document they were pressed over.
	 */
	private active?: { document: vscode.TextDocument; panel: vscode.WebviewPanel };

	/**
	 * The cell a blurb is being written into, per document, while it is written.
	 *
	 * The page is a view and can be rebuilt under the author — reloaded, reopened,
	 * or simply asking again on start-up — so the one thing it shows that is not
	 * in the document is held here and told to it again. A bar that lived only in
	 * the page would vanish while the job it was drawing carried on.
	 */
	private readonly writing = new Map<string, Writing>();

	/**
	 * The documents being checked, for as long as this editor is open.
	 *
	 * Kept here and written nowhere. What a check found is what something thinks
	 * of the prose rather than part of it, and an author drafting has said they do
	 * not want to be told — neither belongs in a file that is the story. So it
	 * lives for the session, the way an underline in a code file does.
	 */
	private readonly checking = new Set<string>();

	/**
	 * The edit still being written to each document, if there is one.
	 *
	 * The page says what it changed and asks for the paragraph to be checked
	 * again in the same breath, and the document is written between the two —
	 * so a check that read the file straight away would read it as it was, find
	 * the fault that has just been put right, and send the mark back to sit under
	 * the correction.
	 */
	private readonly writes = new Map<string, Promise<void>>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly port: number
	) {}

	/** The commands the editor title bar shows, by the name they are bound to. */
	get commands(): Record<string, () => void> {
		return {
			runAll: () => this.onActive((d) => this.write(d, compile(parse(d.getText())))),
			importMarkdown: () => this.onActive((d) => this.importMarkdown(d)),
			exportMarkdown: () =>
				this.onActive(async (d) => {
					const { uri } = await this.exportMarkdown(d);
					void vscode.window.showInformationMessage(
						`Exported ${basename(uri)}`
					);
				}),
			exportEpub: () => this.onActive((d) => this.exportEpub(d)),
			partition: () => this.onActive((d) => this.partition(d)),
			viewSource: () =>
				this.onActive(async (d) => {
					await vscode.commands.executeCommand('vscode.openWith', d.uri, 'default');
				}),
		};
	}

	/**
	 * Run something on the editor in front of the author, and say so when it
	 * fails. Without this every handler was a `void` promise, and a failure was
	 * indistinguishable from a button that did nothing.
	 */
	private onActive(work: (document: vscode.TextDocument) => unknown): void {
		const document = this.active?.document;
		if (!document) {
			return;
		}
		void Promise.resolve(work(document)).catch((err: unknown) =>
			vscode.window.showErrorMessage(describe(err))
		);
	}

	resolveCustomTextEditor(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel
	): void {
		panel.webview.options = {
			enableScripts: true,
			localResourceRoots: assetRoots(this.context.extensionUri, document.uri),
		};
		panel.webview.html = this.html(panel.webview);

		const becomeActive = (): void => {
			this.active = { document, panel };
		};
		becomeActive();
		const focusing = panel.onDidChangeViewState(() => {
			if (panel.active) {
				becomeActive();
			} else if (this.active?.panel === panel) {
				this.active = undefined;
			}
		});

		const send = (): void =>
			void panel.webview.postMessage({
				type: 'cells',
				cells: parse(document.getText()),
				// Images are written as ordinary relative paths; only the webview
				// needs them rewritten, and only it knows they are for it.
				base: panel.webview
					.asWebviewUri(vscode.Uri.joinPath(document.uri, '..'))
					.toString(),
			});

		const watching = vscode.workspace.onDidChangeTextDocument((event) => {
			// A change from anywhere — this view, the text editor beside it, or a
			// tool — is the same news, and the view is repainted from the document.
			if (event.document.uri.toString() === document.uri.toString()) {
				send();
			}
		});

		panel.webview.onDidReceiveMessage((message) => {
			switch (message?.type) {
				case 'ready':
					send();
					this.resume(document, panel);
					// A page rebuilt under the author — reloaded, or reopened — knows
					// nothing about the checks it was showing a moment ago.
					this.sayChecking(document, panel);
					if (this.checking.has(document.uri.toString())) {
						void this.check(document, panel, null, true);
					}
					break;
				case 'cells':
					this.writes.set(
						document.uri.toString(),
						this.write(document, message.cells as Cell[]).catch(() => undefined)
					);
					break;
				case 'compile':
					void this.write(document, compile(parse(document.getText())));
					break;
				case 'checkToggle':
					this.toggleChecking(document, panel);
					break;
				case 'checkBlock':
					void this.check(document, panel, message.where, false);
					break;
				case 'fixMark':
					void this.fixMark(document, panel, message);
					break;
				case 'generate':
					this.onActive((d) => this.generate(d, message.at as number));
					break;
				case 'stop':
					this.onActive((d) => this.stop(d));
					break;
				case 'exportEpub':
					void this.exportEpub(document);
					break;
				case 'exportMarkdown':
					void this.exportMarkdown(document);
					break;
				case 'importMarkdown':
					void this.importMarkdown(document);
					break;
				case 'partition':
					void this.partition(document);
					break;
				case 'openAsText':
					void vscode.commands.executeCommand(
						'vscode.openWith',
						document.uri,
						'default'
					);
					break;
			}
		});

		panel.onDidDispose(() => {
			watching.dispose();
			focusing.dispose();
			if (this.active?.panel === panel) {
				this.active = undefined;
			}
		});
	}

	/**
	 * Put the cells over the document as one edit.
	 *
	 * The whole text is replaced rather than the changed cell patched: a cell's
	 * extent is a consequence of every cell above it, so a targeted edit would
	 * have to work that out to no benefit — VS Code coalesces this into one undo
	 * step either way.
	 */
	private async write(
		document: vscode.TextDocument,
		cells: Cell[]
	): Promise<void> {
		const text = dumps(cells);
		if (text === document.getText()) {
			return;
		}
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			document.uri,
			new vscode.Range(0, 0, document.lineCount, 0),
			text
		);
		await vscode.workspace.applyEdit(edit);
	}

	/**
	 * Turn the checks on this document on or off.
	 *
	 * On, the whole document is read once so the author sees where they stand.
	 * Off, the page is told and drops what it was showing — a check nobody asked
	 * for is an opinion nobody asked for, and drafting is when they least want it.
	 */
	private toggleChecking(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel
	): void {
		const key = document.uri.toString();
		if (this.checking.has(key)) {
			this.checking.delete(key);
			this.sayChecking(document, panel);
			return;
		}
		this.checking.add(key);
		this.sayChecking(document, panel);
		void this.check(document, panel, null, true);
	}

	private sayChecking(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel
	): void {
		void panel.webview.postMessage({
			type: 'checking',
			on: this.checking.has(document.uri.toString()),
		});
	}

	/**
	 * Read a passage and tell the page what is wrong with it.
	 *
	 * The text goes with the request rather than the path alone. Every other job
	 * here writes the document and so needs it on disk first, but a check only
	 * reads — and saving a manuscript because a paragraph was worth a second look
	 * would be the editor writing files the author did not ask it to.
	 *
	 * `whole` says whether what comes back replaces the marks or joins them, which
	 * is the difference between the pass that starts when the checks go on and the
	 * one that follows a paragraph being written in.
	 */
	private async check(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel,
		where: { start: number; end: number } | null,
		whole: boolean
	): Promise<void> {
		// Whatever the page last changed has to be in the document before it is
		// read, or the check answers about the prose as it was.
		await this.writes.get(document.uri.toString());
		// The rules answer in milliseconds and the model in seconds, so they are two
		// waits rather than one. Awaited in order, and the slower one adds to what
		// the faster one put up rather than replacing it — a report that waits for
		// the slowest thing in it is a report nobody sees.
		const asked = {
			path: document.uri.fsPath,
			text: document.getText(),
			selection: where,
		};
		if (await this.report(document, panel, '/check/prose', asked, whole)) {
			await this.report(document, panel, '/check/grammar', asked, false);
		}
	}

	/**
	 * Run one pass and hand what it found to the page.
	 *
	 * Answers whether it is worth going on: a check the author has switched off,
	 * typed over, or that failed outright is not a reason to start the next one.
	 */
	private async report(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel,
		pass: string,
		asked: unknown,
		whole: boolean
	): Promise<boolean> {
		if (!this.checking.has(document.uri.toString())) {
			return false;
		}
		try {
			const started = await fetch(`http://127.0.0.1:${this.port}${pass}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(asked),
			});
			if (!started.ok) {
				throw new Error(await detailOf(started));
			}
			const { id } = (await started.json()) as { id: string };
			const done = await this.awaitJob(`${pass}/status`, id);
			// A check the author typed over was stopped, and stopped early is not the
			// same as found nothing — the pass that superseded it is the one to draw.
			if (done.cancelled) {
				return false;
			}
			if (!this.checking.has(document.uri.toString())) {
				return false;
			}
			void panel.webview.postMessage({
				type: 'marks',
				findings: done.findings ?? [],
				whole,
			});
			return true;
		} catch (err: unknown) {
			// Said in the log and nowhere else. A check is the editor's own idea, and
			// a dialog over the manuscript because one failed would be the
			// interruption the checks are meant not to be.
			console.warn(`Authorship could not check the prose: ${describe(err)}`);
			return false;
		}
	}

	/**
	 * Put one fault right, by naming it rather than the prose around it.
	 *
	 * The whole of the difference from correcting a passage: the model is told
	 * which words and what is wrong with them, so it is answering a question
	 * rather than being asked to reread a paragraph and see what it thinks. And
	 * because a rule found the fault, the same rule can be run over the answer —
	 * a fix that leaves the rule still firing is refused rather than shown.
	 *
	 * Refusals are said out loud, unlike a check that fails. The author pressed a
	 * button and is owed an answer either way.
	 */
	private async fixMark(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel,
		asked: {
			id: number;
			where: unknown;
			rule: string;
			message: string;
			detail: string;
		}
	): Promise<void> {
		try {
			const started = await fetch(`http://127.0.0.1:${this.port}/fix/span`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					path: document.uri.fsPath,
					text: document.getText(),
					where: asked.where,
					rule: asked.rule,
					message: asked.message,
					detail: asked.detail,
				}),
			});
			if (!started.ok) {
				throw new Error(await detailOf(started));
			}
			const { id } = (await started.json()) as { id: string };
			const done = await this.awaitJob('/fix/span/status', id);
			if (done.cancelled) {
				return;
			}
			if (!done.replacement) {
				void vscode.window.showInformationMessage(
					'Nothing came back for that one.'
				);
				return;
			}
			if (!done.verified) {
				void vscode.window.showInformationMessage(
					`That is still flagged after the change, so it was not made: “${done.replacement}”`
				);
				return;
			}
			void panel.webview.postMessage({
				type: 'fixed',
				id: asked.id,
				text: done.replacement,
			});
		} catch (err: unknown) {
			void vscode.window.showWarningMessage(
				`Authorship could not fix that: ${describe(err)}`
			);
		}
	}

	/**
	 * Write the blurb, and put it in the cell that asked for it.
	 *
	 * The blurb comes back rather than being written into the file: a cell's text
	 * is the editor's to write, and an empty cell occupies no lines for the server
	 * to replace. So this lands the same way any other edit does, and undo walks
	 * it back like any other.
	 */
	private async generate(
		document: vscode.TextDocument,
		at: number
	): Promise<void> {
		if (document.isDirty) {
			// It is written from the story, so what is on screen has to be on disk.
			await document.save();
		}
		const started = await fetch(`http://127.0.0.1:${this.port}/generate/blurb`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path: document.uri.fsPath }),
		});
		if (!started.ok) {
			throw new Error(await detailOf(started));
		}
		// The panel is held rather than looked up as it goes: the author is free to
		// click into another editor while the model writes, and the cell waiting for
		// the blurb is in this one whether or not it is still the active panel.
		await this.watch(document, at, this.active?.panel);
	}

	/**
	 * Follow the blurb being written for a document until it lands in its cell.
	 *
	 * Apart from starting the job this is the whole of writing a blurb, which is
	 * why it is not part of starting one: a job outlives the click that began it,
	 * and an editor that comes back to a document being written has to be able to
	 * pick the job up rather than start a second.
	 */
	private async watch(
		document: vscode.TextDocument,
		at: number,
		panel: vscode.WebviewPanel | undefined
	): Promise<void> {
		const key = document.uri.toString();
		const tell = (message: unknown): void => void panel?.webview.postMessage(message);
		const reached = (written: number, chapters: number): void => {
			this.writing.set(key, { at, written, chapters });
			tell({ type: 'writing', at, written, chapters });
		};

		reached(0, 0);
		try {
			const blurb = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Writing the blurb for ${basename(document.uri)}…`,
				},
				async (report) => {
					// VS Code is told what has happened since the last poll rather
					// than how far along the job is, so the share already shown is
					// kept here to subtract. The cell is told the count itself.
					let shown = 0;
					const done = await this.awaitJob(
						'/generate/blurb/status',
						document.uri.fsPath,
						(written, chapters) => {
							const share = (100 * written) / chapters;
							report.report({
								increment: share - shown,
								message: `chapter ${Math.min(written + 1, chapters)} of ${chapters}`,
							});
							shown = share;
							reached(written, chapters);
						}
					);
					return done.blurb ?? '';
				}
			);

			const cells = parse(document.getText());
			// A cancelled job hands back nothing rather than a blurb for half the
			// book, and nothing is not what to put in the author's cell.
			if (!cells[at] || !blurb) {
				return;
			}
			cells[at] = { ...cells[at], source: blurb };
			await this.write(document, cells);
		} finally {
			this.writing.delete(key);
			tell({ type: 'writing', at: null });
		}
	}

	/**
	 * Tell a page that has just come up what is being written into it.
	 *
	 * Twice over, because there are two ways to arrive at a document with a job
	 * already running on it. The page may have been rebuilt under a wait this
	 * editor is still holding — then what it needs is only to be told again. Or
	 * the editor itself is new to a job the server never stopped doing, in which
	 * case nobody is waiting for the blurb and it would be written to nobody.
	 */
	private resume(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel
	): void {
		const held = this.writing.get(document.uri.toString());
		if (held) {
			void panel.webview.postMessage({ type: 'writing', ...held });
			return;
		}
		void this.reattach(document, panel).catch(() => {
			// A document with no job on it is the usual answer, and no news.
		});
	}

	private async reattach(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel
	): Promise<void> {
		const response = await fetch(
			`http://127.0.0.1:${this.port}/generate/blurb/status?id=${encodeURIComponent(document.uri.fsPath)}`
		);
		if (!response.ok) {
			return;
		}
		const body = (await response.json()) as JobStatus;
		if (!body.running) {
			return;
		}
		// Which cell it is going into is not the server's to know — it writes the
		// blurb and the editor places it — but a document has one blurb cell, and
		// that is the one that asked.
		const at = parse(document.getText()).findIndex((cell) => cell.kind === 'blurb');
		if (at >= 0) {
			await this.watch(document, at, panel);
		}
	}

	/** Ask the server to stop whatever it is writing for this document. */
	private async stop(document: vscode.TextDocument): Promise<void> {
		const response = await fetch(`http://127.0.0.1:${this.port}/jobs/cancel`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path: document.uri.fsPath }),
		});
		// A job that finished between the click and this is no failure — what the
		// author asked for is a job that is not running, and there is not one.
		if (!response.ok && response.status !== 404) {
			throw new Error(await detailOf(response));
		}
	}

	/**
	 * Wait for a job to finish, or for it to have gone wrong, and hand back what
	 * it says.
	 *
	 * A job that counts what it has done says so on every poll, and what that is
	 * drawn as belongs to whoever asked — a notification wants the change since
	 * last time, a cell wants the count. This one only passes on what it heard.
	 */
	private async awaitJob(
		status: string,
		id: string,
		progress?: (written: number, chapters: number) => void
	): Promise<JobStatus> {
		const deadline = progress ? Infinity : Date.now() + JOB_TIMEOUT_MS;
		let unanswered = 0;
		while (Date.now() < deadline) {
			await new Promise((wake) => setTimeout(wake, JOB_POLL_MS));
			let response: Response;
			try {
				response = await fetch(
					`http://127.0.0.1:${this.port}${status}?id=${encodeURIComponent(id)}`
				);
			} catch (err: unknown) {
				// The job is on the server and does not stop being done because one
				// question about it went astray; only a run of them means nobody is
				// there to answer.
				if ((unanswered += 1) > POLLS_UNANSWERED) {
					throw err;
				}
				continue;
			}
			if (!response.ok) {
				throw new Error(await detailOf(response));
			}
			unanswered = 0;
			const body = (await response.json()) as JobStatus;
			if (body.error) {
				throw new Error(body.error);
			}
			const { written = 0, chapters = 0 } = body.progress ?? {};
			// Nothing to be a fraction of until the document has been read.
			if (progress && chapters) {
				progress(written, chapters);
			}
			if (!body.running) {
				return body;
			}
		}
		throw new Error('the job is taking longer than expected');
	}

	// --- leaving the format ---

	/**
	 * Write the document out as one plain markdown manuscript, beside itself.
	 *
	 * `<name>.author` becomes `<name>.md`. What markdown cannot carry is which
	 * cell a passage came from, which is why this is an export and not a save.
	 */
	private async exportMarkdown(document: vscode.TextDocument): Promise<Markdown> {
		const target = markdownBeside(document.uri);
        await vscode.workspace.fs.writeFile(
			target,
			new TextEncoder().encode(toMarkdown(parse(document.getText())))
		);
		return { uri: target };
	}

	/**
	 * Replace the document with an existing markdown manuscript.
	 *
	 * This throws away what is here, so it asks first — and it asks with the
	 * file's name in the question, because "are you sure" answers nothing.
	 */
	private async importMarkdown(document: vscode.TextDocument): Promise<void> {
		const picked = await vscode.window.showOpenDialog({
			title: 'Import Markdown',
			openLabel: 'Import',
			// Opened where the story lives, so the manuscript is usually already
			// on screen rather than several folders away.
			defaultUri: vscode.Uri.joinPath(document.uri, '..'),
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			// `All Files` last, as a way out: a filter is a convenience, and a
			// manuscript saved under some other extension should still be openable.
			filters: { Markdown: ['md', 'markdown', 'mdown', 'txt'], 'All Files': ['*'] },
		});
		if (!picked || picked.length === 0) {
			return;
		}
		const source = picked[0];
		const confirmed = await vscode.window.showWarningMessage(
			`Replace everything in ${basename(document.uri)} with ${basename(source)}?`,
			{ modal: true },
			'Replace'
		);
		if (confirmed !== 'Replace') {
			return;
		}
		const bytes = await vscode.workspace.fs.readFile(source);
		await this.write(document, fromMarkdown(new TextDecoder().decode(bytes)));
		// `applyEdit` only changes the document VS Code is holding. An edit to one
		// cell is fine left unsaved, but this replaced the whole file on purpose,
		// so it is written out rather than left as a dirty buffer the author has
		// to remember to save. Undo still walks it back — it went in as one edit.
		await document.save();
		void vscode.window.showInformationMessage(
			`Imported ${basename(source)} into ${basename(document.uri)}`
		);
	}

	/**
	 * Cut the story into `parts/part_1.author`, `part_2.author`… beside it.
	 *
	 * How long a part should be is always asked; whether to keep the story's own
	 * Parts whole is asked only of a story that has them, since in one that has
	 * none the tick changes nothing. The cuts fall between chapters either way, so
	 * a part never opens mid-scene and the lengths land near the quota rather than
	 * on it.
	 *
	 * A part is a story document like any other, so exporting one to an EPUB or to
	 * markdown is the export that already exists.
	 */
	private async partition(document: vscode.TextDocument): Promise<void> {
		const cells = parse(document.getText());
		// The tick is only worth putting to a story that has Parts of its own; one
		// that has none is divided identically either way, and is asked the one
		// question it has an answer to.
		const asked = has(cells, PART) ? await askHowToDivide() : await askHowLong();
		if (asked === undefined) {
			return;
		}
		const { folder, parts } = await divideManuscript(
			document.uri,
			cells,
			asked.quota,
			asked.alongParts
		);
		void vscode.window.showInformationMessage(
			parts === 0
				? 'Nothing to divide — the document has no chapters.'
				: `Wrote ${parts} ${parts === 1 ? 'part' : 'parts'} to ${vscode.workspace.asRelativePath(folder)}`
		);
	}

	/**
	 * Build the book, from the document itself.
	 *
	 * Never by way of markdown: the cells are what say which section is which, and
	 * markdown has no way to carry that — a title page flattened to a `#` line is
	 * a book with no title, no cover and no chapters, only one long page.
	 */
	private async exportEpub(document: vscode.TextDocument): Promise<void> {
		try {
			if (document.isDirty) {
				// The server reads the file from disk, so what is on screen has to
				// be what it binds.
				await document.save();
			}
			const response = await fetch(`http://127.0.0.1:${this.port}/export/epub`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: document.uri.fsPath }),
			});
			if (!response.ok) {
				void vscode.window.showErrorMessage(
					`Export failed: ${response.statusText}`
				);
				return;
			}
			const { path } = (await response.json()) as { path: string };
			void vscode.window.showInformationMessage(
				`Exported ${basename(vscode.Uri.file(path))}`
			);
		} catch (err) {
			void vscode.window.showErrorMessage(
				`Export failed — is the model server running? (${describe(err)})`
			);
		}
	}

	private html(webview: vscode.Webview): string {
		const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
		const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
		const script = webview.asWebviewUri(
			vscode.Uri.joinPath(dist, 'author_view.js')
		);
		const style = webview.asWebviewUri(vscode.Uri.joinPath(media, 'author.css'));
		// VS Code's own icon font, so the buttons here are the buttons everywhere
		// else in the editor rather than whatever glyphs the system has.
		const codicons = webview.asWebviewUri(
			vscode.Uri.joinPath(media, 'codicon.css')
		);
		const nonce = nonceString();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${codicons}" rel="stylesheet">
	<link href="${style}" rel="stylesheet">
	<title>Author</title>
</head>
<body>
${BODY}
	<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
	}
}

interface Markdown {
	uri: vscode.Uri;
}

/** A cell being written, and how far into the story the writing has read. */
interface Writing {
	at: number;
	written: number;
	chapters: number;
}

/**
 * What a job's status endpoint answers, whichever job it is.
 *
 * A grammar pass leaves its result in the file and has nothing to hand back; a
 * blurb is handed back for the editor to place. Both are polled the same way,
 * and a job divided into pieces says how many of them it has finished.
 */
interface JobStatus {
	running: boolean;
	error: string | null;
	blurb?: string;
	progress?: { written: number; chapters: number };
	cancelled?: boolean;
	findings?: unknown[];
	replacement?: string;
	verified?: boolean;
}

/**
 * The one thing a division has to be told beyond how long a part should be.
 *
 * Asked as a tick rather than as two lines to choose between, because it is one
 * question with an answer either way. `alwaysShow`, because the box above it is
 * the one the length is typed into and would otherwise filter it away.
 */
const ALONG_THE_PARTS = {
	label: 'Divide along Parts',
	description: 'a Part longer than the quota is still cut by length, inside it',
	alwaysShow: true,
};

const HOW_LONG = `About how many words should a part be? (${DEFAULT_PART_WORDS} unless you say)`;

/** What a division was asked for. */
interface HowToDivide {
	quota: number;
	alongParts: boolean;
}

/**
 * Both halves of the question in one form: the length in the box, and whether to
 * keep the story's own Parts whole as a tick under it.
 *
 * A quick pick rather than an input box, because only a quick pick carries both.
 * Resolves to undefined for a form the author dismissed rather than answered —
 * a division nobody asked for is a folder of files they have to delete.
 */
function askHowToDivide(): Promise<HowToDivide | undefined> {
	return new Promise((resolve) => {
		const form = vscode.window.createQuickPick();
		form.title = 'Divide into Parts';
		form.placeholder = HOW_LONG;
		form.canSelectMany = true;
		form.items = [ALONG_THE_PARTS];
		form.selectedItems = form.items;

		let answered: HowToDivide | undefined;
		form.onDidAccept(() => {
			// An empty box is the author taking the length offered rather than
			// naming one, which is what `quotaOf` reads it as.
			answered = {
				quota: quotaOf(form.value),
				alongParts: form.selectedItems.length > 0,
			};
			form.hide();
		});
		// Both endings arrive here — accepted or dismissed — so the form is
		// disposed of once and the answer is whatever accepting left behind.
		form.onDidHide(() => {
			form.dispose();
			resolve(answered);
		});
		form.show();
	});
}

/** The length alone, which is the whole of the question in a story with no
 *  Parts to keep whole. */
async function askHowLong(): Promise<HowToDivide | undefined> {
	const asked = await vscode.window.showInputBox({
		title: 'Divide into Parts',
		prompt: 'About how many words should a part be?',
		value: String(DEFAULT_PART_WORDS),
		validateInput: (raw) =>
			Number(raw) > 0 ? null : 'A part is some positive number of words.',
	});
	return asked === undefined
		? undefined
		: { quota: quotaOf(asked), alongParts: false };
}

/**
 * The folders a document's webview is allowed to load pictures out of.
 *
 * Covers and figures are named relative to the document, so the folder it sits
 * in has to be one of them. But a part names its cover `../cover.jpg` — it lives
 * in `parts/` and the art stayed with the story — so the folder alone is not
 * enough, and the boundary is the project the story is in.
 *
 * A file opened from outside any workspace has no project to be in, and falls
 * back to its own folder rather than to the whole disk.
 */
function assetRoots(extension: vscode.Uri, document: vscode.Uri): vscode.Uri[] {
	const project = vscode.workspace.getWorkspaceFolder(document);
	return [
		vscode.Uri.joinPath(extension, 'media'),
		vscode.Uri.joinPath(extension, 'dist'),
		vscode.Uri.joinPath(document, '..'),
		...(project ? [project.uri] : []),
	];
}

/** `story.author` is exported beside itself as `story.md`. */
function markdownBeside(document: vscode.Uri): vscode.Uri {
	return document.with({ path: document.path.replace(/\.author$/i, '') + '.md' });
}

/** What the server said went wrong, or failing that what HTTP said. */
async function detailOf(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { detail?: string };
		return body.detail ?? response.statusText;
	} catch {
		return response.statusText;
	}
}

function basename(uri: vscode.Uri): string {
	return uri.path.split('/').pop() ?? uri.path;
}

function describe(err: unknown): string {
	const message = (err as { message?: unknown } | null)?.message;
	return typeof message === 'string' ? message : String(err);
}

function nonceString(): string {
	const chars =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let out = '';
	for (let i = 0; i < 32; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}
