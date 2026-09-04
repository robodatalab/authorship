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

import {
	compile,
	documentsOf,
	fromMarkdown,
	generatedCell,
	isGenerated,
	labelOf,
	toMarkdown,
	unfilledFields,
	writesOf,
} from './model';
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
import {
	GeminiAccount,
	STYLE_FIX_SETTING,
	configuredModel,
	styleFixEnabled,
} from '../../vscode_runtime/gemini/account';
import {
	applyPlan,
	askOf,
	doneOf,
	wantingKinds,
	type Report,
} from '../../vscode_runtime/publish/layout';
import { loadTemplates, watchSettings } from '../../vscode_runtime/settings/file';
import { useTemplates } from '../../vscode_runtime/settings/model';
import { MARKDOWN, RECAP, type Cell } from '../storydoc_model';
import { dumps } from '../storydoc_model';
import { parse } from '../storydoc_model';

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
	 * The cell being written into, per document, while it is written.
	 *
	 * The page is a view and can be rebuilt under the author — reloaded, reopened,
	 * or simply asking again on start-up — so the one thing it shows that is not
	 * in the document is held here and told to it again. A bar that lived only in
	 * the page would vanish while the job it was drawing carried on.
	 */
	private readonly writing = new Map<string, Writing>();

	/**
	 * The pass correcting each document, per document, while it runs.
	 *
	 * Held for the same reason a blurb's progress is: the bar is not in the file,
	 * so a page rebuilt under a running pass — reloaded, reopened, or simply
	 * asking again on start-up — has to be told about it a second time.
	 */
	private readonly styling = new Map<string, Styling>();

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
		private readonly port: number,
		private readonly account: GeminiAccount
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
			exportEpub: () =>
				this.onActive((d) => this.exportEpub(d, this.active?.panel)),
			partition: () => this.onActive((d) => this.partition(d)),
			fixStyle: () =>
				this.onActive((d) => this.fixStyle(d, this.active?.panel)),
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

		/**
		 * Read the workspace's templates and hand them to the page.
		 *
		 * Both halves need them: the page builds a section the author inserts from
		 * a menu, and this builds the ones an export lays out. They are read per
		 * document rather than once, because a window may hold folders belonging
		 * to two different authors.
		 */
		const sayTemplates = async (): Promise<void> => {
			const said = await loadTemplates(document.uri);
			useTemplates(said);
			void panel.webview.postMessage({ type: 'templates', templates: said });
		};

		// The author editing `.author/settings.json` is the author saying what the
		// next disclaimer should be, and a story stays open far longer than it
		// takes them to go and change it.
		const settings = watchSettings(document.uri, () => void sayTemplates());

		// Turning the experiment on or off changes what the toolbar carries, and
		// an author who has just switched it should not have to reopen the file.
		const switched = vscode.workspace.onDidChangeConfiguration((changed) => {
			if (changed.affectsConfiguration(STYLE_FIX_SETTING)) {
				this.sayFeatures(panel);
			}
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
					void sayTemplates();
					send();
					this.sayFeatures(panel);
					this.resume(document, panel);
					this.resumeStyling(document, panel);
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
				case 'save':
					void this.saveNow(document);
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
					void this.exportEpub(document, panel);
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
				case 'fixStyle':
					// The panel is taken from here rather than looked up as it goes:
					// the author is free to click into another editor while the model
					// reads, and the bar belongs to this one either way.
					void this.fixStyle(document, panel).catch((err: unknown) =>
						vscode.window.showErrorMessage(describe(err))
					);
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
			settings.dispose();
			switched.dispose();
			focusing.dispose();
			if (this.active?.panel === panel) {
				this.active = undefined;
			}
		});
	}

	/**
	 * Save what the author has typed, rather than the cell as it was.
	 *
	 * Ctrl+S in the page is VS Code's own and saves the document as it stands,
	 * which is behind the box being typed in — a cell reaches the document on a
	 * timer. So the page settles the cell first and asks for a save of its own,
	 * which waits for that write to land and then puts on disk what is on screen.
	 */
	private async saveNow(document: vscode.TextDocument): Promise<void> {
		await this.writes.get(document.uri.toString());
		if (document.isDirty) {
			await document.save();
		}
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

	/** Which of the tools that are not always there this page should draw. */
	private sayFeatures(panel: vscode.WebviewPanel): void {
		void panel.webview.postMessage({
			type: 'features',
			styleFix: styleFixEnabled(),
		});
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
	 * Write a section from the story, and put it in the cell that asked for it.
	 *
	 * Two sections are written this way and the difference between them is what
	 * they are written out of: a blurb from the document it stands in, the story
	 * so far from the earlier documents that section names. The kind is taken from
	 * the cell rather than from the click, and it is what names the endpoint —
	 * `blurb` and `recap` are the kinds and the routes both.
	 *
	 * What comes back comes back rather than being written into the file: a cell's
	 * text is the editor's to write, and an empty cell occupies no lines for the
	 * server to replace. So this lands the same way any other edit does, and undo
	 * walks it back like any other.
	 */
	private async generate(
		document: vscode.TextDocument,
		at: number
	): Promise<void> {
		// Whatever the page last changed has to be in the document before it is
		// read, exactly as a check does. The click that starts this is the click
		// that closed the box the author was typing in — the page settles the
		// field and asks for the writing in the same breath — so the edit carrying
		// what they typed is still on its way here. Read the document before it
		// lands and the section is written from the parameters as they were, or,
		// the first time anyone fills the box in, from none at all.
		await this.writes.get(document.uri.toString());
		if (document.isDirty) {
			// It is written from what is in the documents, so what is on screen has
			// to be on disk — this one and, for a recap, the ones it names.
			await document.save();
		}
		const cell = parse(document.getText())[at];
		if (!cell || !isGenerated(cell.kind)) {
			return;
		}
		// Refused here rather than by the server, because the answer is about a
		// box on the page and the page is where the boxes are named. The server
		// answers the same question in its own words for anything that reaches it
		// another way; this is the one an author actually reads.
		const unfilled = unfilledFields(cell);
		if (unfilled.length > 0) {
			throw new Error(
				`${labelOf(cell.kind)} has nothing in ${unfilled
					.map((field) => field.label)
					.join(', ')} — fill it in and run the section again.`
			);
		}
		const started = await fetch(
			`http://127.0.0.1:${this.port}/generate/${cell.kind}`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(
					cell.kind === RECAP
						? { path: document.uri.fsPath, documents: documentsOf(cell) }
						: { path: document.uri.fsPath }
				),
			}
		);
		if (!started.ok) {
			throw new Error(await detailOf(started));
		}
		// The panel is held rather than looked up as it goes: the author is free to
		// click into another editor while the model writes, and the cell waiting for
		// the answer is in this one whether or not it is still the active panel.
		await this.watch(document, at, cell.kind, this.active?.panel);
	}

	/**
	 * Follow the section being written for a document until it lands in its cell.
	 *
	 * Apart from starting the job this is the whole of writing one, which is why
	 * it is not part of starting one: a job outlives the click that began it, and
	 * an editor that comes back to a document being written has to be able to pick
	 * the job up rather than start a second.
	 *
	 * Where the cell is, is not settled by the click that started this. Writing
	 * takes minutes and the document around it stays the author's the whole time,
	 * so a cell added or taken out above it moves it and the index stops naming
	 * it. It is found again from the document on every tick and once more before
	 * the writing lands, because an index that is only ever right at the start is
	 * an index that writes over whatever moved into the slot.
	 *
	 * Found by `kind`, which is why the kind is carried this far: a document may
	 * hold a blurb and a story so far, and an answer that fell back to whichever
	 * generated cell came first would land in the wrong one.
	 */
	private async watch(
		document: vscode.TextDocument,
		at: number,
		kind: string,
		panel: vscode.WebviewPanel | undefined
	): Promise<void> {
		const key = document.uri.toString();
		const tell = (message: unknown): void => void panel?.webview.postMessage(message);
		let into = at;
		let read = -1;
		const reached = (written: number, chapters: number): void => {
			// Looked for again only when the document has actually changed. The
			// job is polled four times a second for as long as it runs, and
			// parsing the manuscript that often to be told the same answer is work
			// nobody asked for.
			if (document.version !== read) {
				read = document.version;
				into = generatedCell(parse(document.getText()), into, kind);
			}
			this.writing.set(key, { at: into, kind, written, chapters });
			tell({ type: 'writing', at: into, kind, written, chapters });
		};

		reached(0, 0);
		try {
			const answer = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Writing ${writesOf(kind)} for ${basename(document.uri)}…`,
				},
				async (report) => {
					// VS Code is told what has happened since the last poll rather
					// than how far along the job is, so the share already shown is
					// kept here to subtract. The cell is told the count itself.
					let shown = 0;
					const done = await this.awaitJob(
						'/generate/status',
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
					return done.text ?? '';
				}
			);

			const cells = parse(document.getText());
			// A cancelled job hands back nothing rather than the story so far as
			// far as it had got, and nothing is not what to put in the author's
			// cell.
			if (!answer) {
				return;
			}
			// Looked for once more, and not taken from the last poll: the author
			// can move it in the moment between the model finishing and this. The
			// cell can also be gone — deleted while the model wrote — and writing
			// with nowhere to go goes nowhere. Written into whatever now stands at
			// that index it would take a page of the book away to make room for
			// itself, which is the one outcome worse than no answer at all.
			const cell = generatedCell(cells, into, kind);
			if (cell < 0) {
				return;
			}
			cells[cell] = { ...cells[cell], source: answer };
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
	 * case nobody is waiting for the answer and it would be written to nobody.
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
			`http://127.0.0.1:${this.port}/generate/status?id=${encodeURIComponent(document.uri.fsPath)}`
		);
		if (!response.ok) {
			return;
		}
		const body = (await response.json()) as JobStatus;
		if (!body.running || !body.kind) {
			return;
		}
		// Which cell it is going into is not the server's to know — it writes the
		// section and the editor places it — but it does say which kind of section
		// it is writing, and a document has one cell of that kind: the one that
		// asked.
		const at = generatedCell(parse(document.getText()), -1, body.kind);
		if (at >= 0) {
			await this.watch(document, at, body.kind, panel);
		}
	}

	/**
	 * Correct the style and grammar of the whole manuscript.
	 *
	 * The one tool here that does not run on this machine. Style is a property of
	 * a chapter rather than of a sentence — whether a scene keeps its tense,
	 * whether a name is spelt as it was spelt in chapter one — so the pass reads
	 * the corrected book so far in front of each chapter, which needs a context
	 * length the local models do not have. It goes to Gemini, on the author's own
	 * account, which is why this is the one thing they have to sign in for.
	 */
	private async fixStyle(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel | undefined
	): Promise<void> {
		// Off is the feature not being there. The button is hidden, so this is
		// only reachable from the Command Palette — which lists every contributed
		// command whether or not the extension wants it run.
		if (!styleFixEnabled()) {
			const open = await vscode.window.showInformationMessage(
				'Fixing style and grammar with Gemini is an experimental feature, and is off.',
				'Open Settings'
			);
			if (open === 'Open Settings') {
				await vscode.commands.executeCommand(
					'workbench.action.openSettings',
					STYLE_FIX_SETTING
				);
			}
			return;
		}
		// Signing in comes first for an author who has not: being told a manuscript
		// is about to be sent somewhere is no use to someone who has nowhere to
		// send it, and the key is what makes the warning about a real thing.
		const key = await this.account.require();
		if (!key) {
			// They were asked and said no. That is an answer, not a failure.
			return;
		}
		if (!(await this.confirmSending(document))) {
			return;
		}
		if (document.isDirty) {
			// The server reads the file, so what is on screen has to be on disk.
			await document.save();
		}
		const started = await fetch(`http://127.0.0.1:${this.port}/fix/style`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				path: document.uri.fsPath,
				key,
				model: configuredModel(),
			}),
		});
		if (!started.ok) {
			throw new Error(await detailOf(started));
		}
		await this.watchStyle(document, panel);
	}

	/**
	 * Say plainly that this one leaves the machine, and let the author call it off.
	 *
	 * Every time it is asked for, and not once when they sign in. Everything else
	 * Authorship does runs on this computer, so an author who has used the other
	 * tools has every reason to assume this one does too — and the moment to say
	 * otherwise is the moment they press the button, not a paragraph of a readme
	 * they last looked at when they installed it. It is the only warning that
	 * arrives before a manuscript is sent rather than after.
	 *
	 * Modal on purpose. A notification for this would be a notification behind
	 * the editor, read after the first chapter was already in Google's hands.
	 */
	private async confirmSending(document: vscode.TextDocument): Promise<boolean> {
		const send = 'Send to Gemini';
		const confirmed = await vscode.window.showWarningMessage(
			`Send the chapters of ${basename(document.uri)} to Google Gemini?`,
			{
				modal: true,
				detail:
					'Fixing style and grammar is the one tool in Authorship that does ' +
					'not run on your machine. The chapter titles and the prose written ' +
					'under them are sent over the internet to the Gemini API, on your ' +
					'own account, and are billed to it.\n\n' +
					'Your notes, blurb, cover, title page and table of contents are ' +
					'not sent. Nothing else Authorship does leaves this computer.',
			},
			send
		);
		return confirmed === send;
	}

	/**
	 * Follow a pass over a document, putting each corrected section in as it lands.
	 *
	 * As with a blurb, apart from starting the job this is the whole of the work,
	 * and for the same reason it is not part of starting one: a pass over a novel
	 * outlives the click that began it, and an editor coming back to a document
	 * being corrected has to pick the job up rather than start a second.
	 *
	 * The corrections are put in a chapter at a time rather than all at the end.
	 * A pass over a book is minutes long, and an author watching it work is owed
	 * the chapters as they are done — and a pass that fails at chapter forty
	 * should leave thirty-nine corrected chapters behind rather than nothing.
	 */
	private async watchStyle(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel | undefined
	): Promise<void> {
		const key = document.uri.toString();
		const tell = (message: unknown): void => void panel?.webview.postMessage(message);
		const reached = (
			written: number,
			chapters: number,
			note: string | null = null
		): void => {
			this.styling.set(key, { written, chapters, note });
			tell({ type: 'styling', on: true, written, chapters, note });
		};

		// How many of the corrected sections are already in the document. The
		// server hands back every one it has done on every poll, rather than only
		// the new ones — a poll that went astray would otherwise lose a chapter's
		// corrections for good — so this is what tells them apart.
		let applied = 0;
		let last: JobStatus | undefined;

		reached(0, 0);
		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Fixing the style and grammar of ${basename(document.uri)}…`,
					cancellable: true,
				},
				async (report, token) => {
					// A job that finished between the click and this is no failure,
					// and there is nobody to tell either way — the pass itself says
					// what happened, a moment later, when it stops.
					token.onCancellationRequested(
						() => void this.stop(document).catch(() => undefined)
					);
					// VS Code is told what has happened since the last poll rather
					// than how far along the job is, so the share already shown is
					// kept here to subtract. The page is told the count itself.
					let shown = 0;
					return await this.awaitJob(
						'/fix/style/status',
						document.uri.fsPath,
						(written, chapters) => {
							const share = (100 * written) / chapters;
							report.report({
								increment: share - shown,
								message: `chapter ${Math.min(written + 1, chapters)} of ${chapters}`,
							});
							shown = share;
						},
						async (body) => {
							last = body;
							// Told on every poll rather than only when a chapter
							// lands, because what this is for is the stretches
							// where no chapter is landing.
							const { written = 0, chapters = 0 } = body.progress ?? {};
							reached(written, chapters, body.note ?? null);
							const sections = body.sections ?? [];
							if (sections.length > applied) {
								const fresh = sections.slice(applied);
								applied = sections.length;
								await this.applySections(document, fresh);
							}
						}
					);
				}
			);
			// A chapter left as it was is the right answer to an answer that could
			// not be trusted, and an invisible one: the document looks exactly as
			// it would if the chapter had needed no correcting. So it is said out
			// loud, with the reason, once the pass is over.
			this.reportLeftAlone(last?.leftAlone ?? []);
		} catch (err: unknown) {
			// A model the account's plan does not include is not a key problem, and
			// signing in again would fix nothing — the answer is a different model,
			// or billing on the account. Offered as the button, since the command
			// that lists what the key can actually use is the one thing that helps.
			if (last?.noQuota) {
				const chose = await vscode.window.showWarningMessage(
					describe(err),
					'Choose a model'
				);
				if (chose === 'Choose a model') {
					await vscode.commands.executeCommand('authorship.gemini.chooseModel');
				}
				return;
			}
			// A key Gemini has stopped taking is stored truth that has gone stale.
			// Left there, every pass from now on fails the same way, and the way
			// out is a command the author has no reason to go looking for.
			if (last?.unauthorized) {
				await this.account.forget();
				const again = await vscode.window.showWarningMessage(
					'Gemini would not take the key Authorship had. Sign in again to correct the style.',
					'Sign in'
				);
				if (again === 'Sign in') {
					// Through the same door the button uses, rather than a second way
					// in: the account is now signed out, so asking for the key is
					// asking for a new one.
					await this.account.require();
				}
				return;
			}
			throw err;
		} finally {
			this.styling.delete(key);
			tell({ type: 'styling', on: false });
		}
	}

	/**
	 * Say which chapters were left as they were, and why.
	 *
	 * Not a dialog for each: a pass over a novel that hit a rough patch could
	 * name a dozen, and twelve dialogs is a pass nobody finishes dismissing.
	 */
	private reportLeftAlone(skipped: { chapter: string; why: string }[]): void {
		if (skipped.length === 0) {
			return;
		}
		const named = skipped
			.map((one) => `“${one.chapter}” — ${one.why}`)
			.join('; ');
		void vscode.window.showWarningMessage(
			skipped.length === 1
				? `One chapter was left as you wrote it: ${named}`
				: `${skipped.length} chapters were left as you wrote them: ${named}`
		);
	}

	/**
	 * Put corrected sections into the document, as one edit.
	 *
	 * The server names the cell each correction belongs to rather than the lines
	 * it covers: a line span would name the wrong place by the time the chapter
	 * after it is done, and the whole point of a pass is that it takes minutes.
	 *
	 * A cell that is no longer the markdown it was is left alone. The document
	 * cannot be edited while a pass runs, but it can be reverted, or written to
	 * by something else — and a correction for a chapter that is not there any
	 * more belongs nowhere.
	 */
	private async applySections(
		document: vscode.TextDocument,
		sections: { index: number; source: string }[]
	): Promise<void> {
		const cells = parse(document.getText());
		let changed = false;
		for (const { index, source } of sections) {
			const cell = cells[index];
			if (!cell || cell.kind !== MARKDOWN || cell.source === source) {
				continue;
			}
			cells[index] = { ...cell, source };
			changed = true;
		}
		if (changed) {
			await this.write(document, cells);
		}
	}

	/**
	 * Tell a page that has just come up about a pass over its document.
	 *
	 * The same two ways in as a blurb: the page may have been rebuilt under a
	 * wait this editor is still holding, in which case it only has to be told
	 * again — or this editor is new to a job the server never stopped doing, and
	 * nobody is waiting to put the corrections anywhere.
	 */
	private resumeStyling(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel
	): void {
		const held = this.styling.get(document.uri.toString());
		if (held) {
			void panel.webview.postMessage({ type: 'styling', on: true, ...held });
			return;
		}
		void this.reattachStyle(document, panel).catch(() => {
			// A document with no pass on it is the usual answer, and no news.
		});
	}

	private async reattachStyle(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel
	): Promise<void> {
		const response = await fetch(
			`http://127.0.0.1:${this.port}/fix/style/status?id=${encodeURIComponent(document.uri.fsPath)}`
		);
		if (!response.ok) {
			return;
		}
		if (!((await response.json()) as JobStatus).running) {
			return;
		}
		await this.watchStyle(document, panel);
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
	 *
	 * `each` is for a job that hands back its work as it goes rather than at the
	 * end. It is awaited and it is given the whole answer, because putting a
	 * chapter into the document is an edit and the next poll must not overtake
	 * it. It runs before a failure is raised, so the chapters a job did finish
	 * survive the one that went wrong.
	 */
	private async awaitJob(
		status: string,
		id: string,
		progress?: (written: number, chapters: number) => void,
		each?: (body: JobStatus) => Promise<void> | void
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
			if (each) {
				await each(body);
			}
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
	 * Nothing is asked, because the author has already said it: the cuts fall
	 * where they put the Parts, one file each. A Part they would rather the reader
	 * did not meet is marked unprinted and divides the files just the same, so
	 * saying where a story breaks costs the book nothing.
	 *
	 * A part is a story document like any other, so exporting one to an EPUB or to
	 * markdown is the export that already exists.
	 */
	private async partition(document: vscode.TextDocument): Promise<void> {
		const cells = parse(document.getText());
		const { folder, parts } = await divideManuscript(document.uri, cells);
		void vscode.window.showInformationMessage(
			parts === 0
				? `Nothing to divide — add a Part where ${basename(document.uri)} should break.`
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
	private async exportEpub(
		document: vscode.TextDocument,
		panel?: vscode.WebviewPanel,
		force = false
	): Promise<void> {
		try {
			if (document.isDirty) {
				// The server reads the file from disk, so what is on screen has to
				// be what it binds.
				await document.save();
			}
			const response = await fetch(`http://127.0.0.1:${this.port}/export/epub`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: document.uri.fsPath, force }),
			});
			if (!response.ok) {
				void vscode.window.showErrorMessage(
					`Export failed: ${response.statusText}`
				);
				return;
			}
			const report = (await response.json()) as Report;
			// Whatever came of the request, the answer says which sections are
			// still to write — so the marks are put up before anything else is
			// decided, including when the book bound anyway.
			this.sayWanting(panel, report);

			if (report.path) {
				void vscode.window.showInformationMessage(
					`Exported ${basename(vscode.Uri.file(report.path))}`
				);
				return;
			}
			await this.putLayout(document, panel, report);
		} catch (err) {
			void vscode.window.showErrorMessage(
				`Export failed — is the model server running? (${describe(err)})`
			);
		}
	}

	/**
	 * Put to the author a book the server would not bind.
	 *
	 * **Fix does not export.** A section written in is an empty section, and a
	 * book bound straight over one has a blank page where its cover should be —
	 * so fixing lays the document out, leaves what is still wanting marked, and
	 * hands it back. Only Export Anyway binds what is there, and only because the
	 * author was shown what was missing and asked for the file regardless.
	 *
	 * Nothing here decides what a book needs. The plan, the names and the reasons
	 * all came from the exporter; this carries them into the document.
	 */
	private async putLayout(
		document: vscode.TextDocument,
		panel: vscode.WebviewPanel | undefined,
		report: Report
	): Promise<void> {
		const name = basename(document.uri);
		const { message, detail } = askOf(name, report);
		const answer = await vscode.window.showWarningMessage(
			message,
			{ modal: true, detail },
			'Fix',
			'Export Anyway'
		);
		if (answer === 'Export Anyway') {
			await this.exportEpub(document, panel, true);
			return;
		}
		if (answer !== 'Fix') {
			return;
		}
		// The sections the plan writes in are blank ones, and a blank disclaimer is
		// the workspace's. Read them here rather than trust what the last document
		// opened left behind.
		useTemplates(await loadTemplates(document.uri));
		// One edit, so one undo walks all of it back.
		await this.write(document, applyPlan(parse(document.getText()), report.plan));
		void vscode.window.showInformationMessage(doneOf(name, report));
	}

	/**
	 * Tell the page which sections are still to write.
	 *
	 * By kind rather than by index: the author is about to add, move and delete
	 * cells around these, and an index would name the wrong one by the time they
	 * looked. A kind names the same section for as long as the section exists.
	 */
	private sayWanting(
		panel: vscode.WebviewPanel | undefined,
		report: Report
	): void {
		void panel?.webview.postMessage({
			type: 'wanting',
			kinds: wantingKinds(report),
		});
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

/** A cell being written, which kind it is, and how far the writing has read. */
interface Writing {
	at: number;
	kind: string;
	written: number;
	chapters: number;
}

/** A pass over the whole document, and how far through its chapters it is. */
interface Styling {
	written: number;
	chapters: number;
	/** What it is doing when it is not writing — waiting out a rate limit. */
	note?: string | null;
}

/**
 * What a job's status endpoint answers, whichever job it is.
 *
 * A grammar pass leaves its result in the file and has nothing to hand back; a
 * written section is handed back for the editor to place, and says which kind of
 * cell it belongs in. Both are polled the same way, and a job divided into pieces
 * says how many of them it has finished.
 */
interface JobStatus {
	running: boolean;
	error: string | null;
	/** What a written section came to, and the kind of cell it goes in. */
	text?: string;
	kind?: string;
	progress?: { written: number; chapters: number };
	cancelled?: boolean;
	findings?: unknown[];
	replacement?: string;
	verified?: boolean;
	/** Every section a style pass has corrected so far, by the cell it belongs to. */
	sections?: { index: number; source: string }[];
	/** Whether what stopped a style pass was the key rather than the work. */
	unauthorized?: boolean;
	/** Whether it was the model: one the account's plan does not include. */
	noQuota?: boolean;
	/** What a style pass is doing while no chapter is landing. */
	note?: string | null;
	/** Chapters the pass could not use an answer for, and why. */
	leftAlone?: { chapter: string; why: string }[];
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
