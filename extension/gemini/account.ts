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
// The key lives in VS Code's secret store — the keychain on this machine — and
// nowhere else. Not in settings, which sync; not in a file beside the
// manuscript, which is in the author's repository within a day.

import * as vscode from 'vscode';

/** Where the key is kept. The store is the extension's own, so a plain name. */
const SECRET = 'gemini.apiKey';

const STUDIO = 'https://aistudio.google.com/apikey';

/** Long enough for a key that has to be checked against Google. */
const CHECK_TIMEOUT_MS = 20_000;

export class GeminiAccount {
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly port: number
	) {}

	/** The commands the palette shows, by the name they are bound to. */
	get commands(): Record<string, () => void> {
		return {
			signIn: () => void this.signIn(),
			signOut: () => void this.signOut(),
		};
	}

	/** The key the author signed in with, or nothing. */
	key(): Thenable<string | undefined> {
		return this.context.secrets.get(SECRET);
	}

	/**
	 * The key, asking for one if there is none.
	 *
	 * Undefined means the author declined, which is an answer and not a failure —
	 * whatever asked simply does not happen, and nothing is said about it.
	 */
	async require(): Promise<string | undefined> {
		return (await this.key()) ?? (await this.signIn());
	}

	/**
	 * Take a key, check it, and keep it.
	 *
	 * Checked before it is kept, because the alternative is a pass over a novel
	 * that fails a minute in with a message about an HTTP status. A key that
	 * cannot be checked — because the local server is not up yet — is taken on
	 * trust: refusing it would make signing in depend on something that has
	 * nothing to do with signing in.
	 */
	async signIn(): Promise<string | undefined> {
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
		if (refused) {
			const again = await vscode.window.showErrorMessage(
				`Gemini would not take that key: ${refused}`,
				'Try again'
			);
			return again === 'Try again' ? this.signIn() : undefined;
		}

		await this.context.secrets.store(SECRET, key);
		void vscode.window.showInformationMessage('Signed in to Gemini.');
		return key;
	}

	/** Forget the key. The account itself is Google's and is not touched. */
	async signOut(): Promise<void> {
		await this.context.secrets.delete(SECRET);
		void vscode.window.showInformationMessage(
			'Signed out of Gemini. The key has been forgotten.'
		);
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
		await this.context.secrets.delete(SECRET);
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
				body: JSON.stringify({ key }),
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
}
