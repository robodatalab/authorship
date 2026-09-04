// Runs the model server as a child of the extension host.
//
// A released extension has nobody else to start it: the launch configuration
// that starts it in development ships with the repository, not with the VSIX.
// So the same port that development binds by hand is bound here instead, and
// everything downstream — the status bar, the editor, the publish view — goes on
// talking to a fixed local address without knowing who started what.

import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';

import { provision } from './install';

/** Short: this only has to distinguish a live server from a free port. */
const PROBE_TIMEOUT_MS = 1_000;

export class ModelServer implements vscode.Disposable {
	private child: ChildProcess | undefined;
	private stopped = false;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly port: number,
		private readonly log: vscode.OutputChannel
	) {
		// Installing takes minutes on a cold machine, and activation that takes
		// minutes is activation VS Code complains about. So this runs underneath:
		// the views register immediately, the status bar reads offline, and the
		// bar turns over on its own once the server answers.
		void this.start();
	}

	private async start(): Promise<void> {
		// In development the compound launch configuration starts the server under
		// a debugger. Spawning a second one would take the port from it, and take
		// the breakpoints with it.
		if (this.context.extensionMode === vscode.ExtensionMode.Development) {
			this.log.appendLine('development host: leaving the server to the launch configuration');
			return;
		}

		// A second window is a second extension host, and both would try for the
		// same port. Whichever got there first serves them both.
		if (await answers(this.port)) {
			this.log.appendLine(`a server is already listening on ${this.port}`);
			return;
		}

		try {
			const python = (await provision(this.context, this.log)).python;
			if (this.stopped) {
				return;
			}
			this.run(python.fsPath);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.log.appendLine(`the model server could not be started: ${message}`);
			const shown = await vscode.window.showErrorMessage(
				`Authorship could not install the writing model: ${message}`,
				'Show Log'
			);
			if (shown === 'Show Log') {
				this.log.show();
			}
		}
	}

	/**
	 * `cwd` is the extension directory because `server` is a package resolved from
	 * there — the same import the development launch makes from the repository
	 * root, which the extension directory is a copy of.
	 */
	private run(python: string): void {
		this.log.appendLine(`starting the model server on ${this.port}`);
		const child = spawn(python, ['-m', 'server', '--port', String(this.port)], {
			cwd: this.context.extensionUri.fsPath,
		});

		const write = (chunk: Buffer): void => this.log.append(chunk.toString());
		child.stdout.on('data', write);
		child.stderr.on('data', write);

		child.on('exit', (code) => {
			if (!this.stopped) {
				this.log.appendLine(`the model server exited with ${code}`);
			}
		});

		this.child = child;
	}

	dispose(): void {
		this.stopped = true;
		this.child?.kill();
	}
}

/** Whether anything is already serving this port. */
async function answers(port: number): Promise<boolean> {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/health`, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		return response.ok;
	} catch {
		return false;
	}
}
