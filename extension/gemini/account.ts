// The author's Google Gemini account, as far as this extension is concerned.
//
// Everything else Authorship does runs on the machine it is installed on, and
// needs no account at all. Correcting the style of a novel does not: it means
// holding the corrected book in the prompt while the next chapter is read, which
// is a context length no model that fits beside the others on a laptop has. So
// that one pass goes to Gemini, on the author's own account.
//
// What "signing in" means here is a key from Google AI Studio, and that is a
// deliberate choice rather than a shortcut. The Gemini API is billed against a
// key; there is no consumer sign-in that grants a desktop application access to
// it, so an OAuth flow would end at the same page and hand back the same string
// with more moving parts in between.
//
// It is nonetheless a real `vscode.AuthenticationProvider` rather than a command
// and a secret, and that is the whole reason this file is shaped the way it is.
// An account belongs in the Accounts menu — the avatar at the foot of the
// activity bar — because that is where a person goes to find out what they are
// signed in to and to sign out of it. A key reachable only through the Command
// Palette is a key nobody can find, and worse, one nobody can tell they have
// given away. The provider puts "Google Gemini" in that menu with the rest.
//
// The key itself lives in VS Code's secret store — the keychain on this machine —
// and nowhere else. Not in settings, which sync; not in a file beside the
// manuscript, which is in the author's repository within a day.

import * as vscode from 'vscode';

/** Matches `contributes.authentication` in package.json, which is what puts
 *  this in the Accounts menu before anything has activated the extension. */
export const PROVIDER = 'gemini';
const PROVIDER_LABEL = 'Google Gemini';

/** Where the key is kept. The store is the extension's own, so a plain name. */
const SECRET = 'gemini.apiKey';

/** There is only ever one, so its id is a constant rather than something made up. */
const SESSION = 'gemini-api-key';

const STUDIO = 'https://aistudio.google.com/apikey';

/** Long enough for a key that has to be checked against Google. */
const CHECK_TIMEOUT_MS = 20_000;

/**
 * Which Gemini the author has asked for, or nothing for the one we ship with.
 *
 * Read here and passed with every request rather than left to the server's own
 * default, so that the model a key is checked against at sign-in is the model
 * the pass will use. Those two drifting apart is how a key came to sign in
 * cleanly and then fail on the first chapter.
 */
export function configuredModel(): string | undefined {
	const named = vscode.workspace
		.getConfiguration('authorship')
		.get<string>('gemini.model');
	return named?.trim() || undefined;
}

export class GeminiAccount
	implements vscode.AuthenticationProvider, vscode.Disposable
{
	private readonly changed =
		new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

	readonly onDidChangeSessions = this.changed.event;

	private readonly registration: vscode.Disposable;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly port: number
	) {
		this.registration = vscode.authentication.registerAuthenticationProvider(
			PROVIDER,
			PROVIDER_LABEL,
			this,
			// One key, one account. A second would be a second bill and no second
			// thing to spend it on.
			{ supportsMultipleAccounts: false }
		);
		this.advertise();
	}

	/**
	 * Ask VS Code for a session without prompting for one, so that not having one
	 * is visible.
	 *
	 * This is the whole of how a provider nobody has signed in to gets into the
	 * Accounts menu. The menu lists sessions rather than providers, so a
	 * registered provider with none is invisible there — but an extension that
	 * has *asked* for a session and not got one puts a badge on the avatar and a
	 * sign-in entry inside, which is `silent` left at its default of false.
	 *
	 * Asked once on activation rather than only when the style pass wants it,
	 * because the point is to be findable before anybody needs it. It costs a
	 * badge on the avatar for an author who never uses the one tool this is for;
	 * being unfindable cost more.
	 */
	private advertise(): void {
		// Resolves to undefined when there is no session, which is the case this
		// is for. Nothing is done with the answer — the asking is the point.
		void Promise.resolve(
			vscode.authentication.getSession(PROVIDER, [])
		).then(undefined, () => undefined);
	}

	/** The commands the palette shows, by the name they are bound to. */
	get commands(): Record<string, () => void> {
		return {
			signIn: () => void this.signIn(),
			signOut: () => void this.signOut(),
			chooseModel: () => void this.chooseModel(),
		};
	}

	// --- the authentication provider ---

	async getSessions(): Promise<vscode.AuthenticationSession[]> {
		const key = await this.context.secrets.get(SECRET);
		return key ? [sessionFor(key)] : [];
	}

	/**
	 * Take a key, check it, and keep it.
	 *
	 * Rejects rather than answers when the author backs out, because that is the
	 * contract: a provider that resolved with nothing would have VS Code believe
	 * a sign-in had happened.
	 */
	async createSession(): Promise<vscode.AuthenticationSession> {
		const key = await this.askForKey();
		if (!key) {
			throw new Error('Signing in to Gemini was cancelled.');
		}
		await this.context.secrets.store(SECRET, key);
		const session = sessionFor(key);
		this.changed.fire({ added: [session], removed: [], changed: [] });
		return session;
	}

	/** Forget the key. The account itself is Google's and is not touched. */
	async removeSession(): Promise<void> {
		const key = await this.context.secrets.get(SECRET);
		await this.context.secrets.delete(SECRET);
		if (key) {
			this.changed.fire({
				added: [],
				removed: [sessionFor(key)],
				changed: [],
			});
		}
	}

	// --- what the editor asks of it ---

	/**
	 * The key, asking for one if there is none.
	 *
	 * Undefined means the author declined, which is an answer and not a failure —
	 * whatever asked simply does not happen, and nothing is said about it.
	 */
	async require(): Promise<string | undefined> {
		try {
			const session = await vscode.authentication.getSession(PROVIDER, [], {
				createIfNone: true,
			});
			return session?.accessToken;
		} catch {
			return undefined;
		}
	}

	/**
	 * Forget a key Gemini has since stopped taking, so the next pass asks again.
	 *
	 * Called when a job comes back unauthorized rather than merely failing: a
	 * revoked or rotated key is stored truth that has gone stale, and leaving it
	 * there means every pass from now on fails the same way with no way out
	 * except a command the author has no reason to look for.
	 */
	async forget(): Promise<void> {
		await this.removeSession();
	}

	// --- the commands ---

	/** Sign in, or replace the key already there. */
	private async signIn(): Promise<void> {
		try {
			await vscode.authentication.getSession(PROVIDER, [], {
				forceNewSession: true,
			});
			void vscode.window.showInformationMessage('Signed in to Gemini.');
		} catch {
			// Backed out. Nothing to say about it.
		}
	}

	private async signOut(): Promise<void> {
		if ((await this.getSessions()).length === 0) {
			void vscode.window.showInformationMessage(
				'There is no Gemini key to forget.'
			);
			return;
		}
		await this.removeSession();
		void vscode.window.showInformationMessage(
			'Signed out of Gemini. The key has been forgotten.'
		);
	}

	/**
	 * Pick the Gemini to use, from the ones this key can actually reach.
	 *
	 * The list comes from Google at the moment it is asked for, which is the only
	 * authority on what is current — a list written into this extension is the
	 * thing that goes stale, and going stale is what this is here to fix.
	 *
	 * Newest-looking first, and chosen rather than guessed. Moving a manuscript
	 * onto a different model changes what the prose comes back as and what it
	 * costs, so it is not something to do on the author's behalf because a name
	 * sorted higher.
	 */
	private async chooseModel(): Promise<void> {
		const key = await this.require();
		if (!key) {
			return;
		}
		const offered = await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Asking Gemini which models your key can use…',
			},
			() => this.listModels(key)
		);
		if (!offered) {
			return;
		}

		const current = configuredModel();
		const items: (vscode.QuickPickItem & { model?: string })[] = [
			{
				label: 'Use the model Authorship ships with',
				description: current ? undefined : 'current',
				model: undefined,
			},
			...offered.map((one) => ({
				label: one.model,
				description: one.model === current ? 'current' : one.label,
				detail: one.detail,
				model: one.model,
			})),
		];

		const picked = await vscode.window.showQuickPick(items, {
			title: 'Choose Gemini Model',
			placeHolder: 'Newest first. This is what will correct your chapters.',
			matchOnDetail: true,
		});
		if (!picked) {
			return;
		}
		// Written to the workspace's settings rather than the folder's: a key and
		// the model it reaches are properties of this machine, not of the book.
		await vscode.workspace
			.getConfiguration('authorship')
			.update('gemini.model', picked.model ?? '', vscode.ConfigurationTarget.Global);
		void vscode.window.showInformationMessage(
			picked.model
				? `Fixing style and grammar will use ${picked.model}.`
				: 'Fixing style and grammar will use the model Authorship ships with.'
		);
	}

	/** What the server says this key can write with, or nothing if it could not ask. */
	private async listModels(
		key: string
	): Promise<{ model: string; label: string; detail: string }[] | undefined> {
		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/gemini/models`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key }),
				signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
			});
			if (!response.ok) {
				const said = (await response.json()) as { detail?: string };
				throw new Error(said.detail ?? response.statusText);
			}
			const body = (await response.json()) as {
				models: { model: string; label: string; detail: string }[];
			};
			return body.models;
		} catch (err: unknown) {
			const said = (err as { message?: unknown } | null)?.message;
			void vscode.window.showErrorMessage(
				`Could not ask Gemini which models are available: ${typeof said === 'string' ? said : String(err)}`
			);
			return undefined;
		}
	}

	// --- taking the key ---

	/**
	 * Ask for a key and check it before handing it back.
	 *
	 * Checked first because the alternative is a pass over a novel that fails a
	 * minute in with a message about an HTTP status. A key that cannot be checked
	 * — because the local server is not up yet — is taken on trust: refusing it
	 * would make signing in depend on something that has nothing to do with
	 * signing in.
	 */
	private async askForKey(): Promise<string | undefined> {
		const asked = await vscode.window.showInputBox({
			title: 'Sign in to Gemini',
			prompt: `Paste an API key from Google AI Studio (${STUDIO}). It is kept in this machine's keychain.`,
			placeHolder: 'AIza…',
			password: true,
			// The author is about to leave the window for the browser, and an
			// input box that closed while they were gone would lose the key they
			// went to fetch.
			ignoreFocusOut: true,
			validateInput: (raw) =>
				raw.trim() ? null : 'Paste a key, or press Escape to leave it.',
		});
		if (asked === undefined) {
			void this.offerTheStudio();
			return undefined;
		}

		const key = asked.trim();
		const refused = await this.refusal(key);
		if (!refused) {
			return key;
		}
		const again = await vscode.window.showErrorMessage(
			`Gemini would not take that key: ${refused}`,
			'Try again'
		);
		return again === 'Try again' ? this.askForKey() : undefined;
	}

	/**
	 * What the server says is wrong with this key, or nothing.
	 *
	 * The check goes through the server rather than straight to Google: the
	 * server is what will use the key, so it is the one whose answer means
	 * anything — and it is the only place that knows which Gemini model the pass
	 * is going to ask for.
	 */
	private async refusal(key: string): Promise<string | undefined> {
		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/auth/gemini`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key, model: configuredModel() }),
				signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
			});
			if (!response.ok) {
				return undefined;
			}
			const body = (await response.json()) as { ok: boolean; detail?: string };
			return body.ok ? undefined : (body.detail ?? 'the key was not accepted');
		} catch {
			// The server is not up. Not the author's problem, and not a reason to
			// refuse a key that is very likely fine.
			return undefined;
		}
	}

	/** A way to the page the key comes from, for an author who has not got one. */
	private async offerTheStudio(): Promise<void> {
		const shown = await vscode.window.showInformationMessage(
			'Fixing style and grammar runs on Google Gemini, with your own API key.',
			'Get a key'
		);
		if (shown === 'Get a key') {
			await vscode.env.openExternal(vscode.Uri.parse(STUDIO));
		}
	}

	dispose(): void {
		this.registration.dispose();
		this.changed.dispose();
	}
}

/**
 * The key as an account VS Code can name.
 *
 * A key carries no address, so there is no email to show the way a Microsoft or
 * GitHub account has one. Its last few characters are what tells one key from
 * another when the author is looking at the menu wondering which they pasted.
 */
function sessionFor(key: string): vscode.AuthenticationSession {
	return {
		id: SESSION,
		accessToken: key,
		account: { id: SESSION, label: `API key …${key.slice(-4)}` },
		scopes: [],
	};
}
