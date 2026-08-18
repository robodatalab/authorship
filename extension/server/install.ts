// Builds the Python environment the model server runs in, on the user's machine,
// the first time a released extension starts.
//
// None of that environment can travel in the VSIX. torch, transformers and spacy
// resolve to platform-specific wheels measured in gigabytes, and the interpreter
// is not ours to ship either. What does travel is the server source, the
// lockfile, and `uv` — a single static binary that installs both, fetching its
// own CPython when the machine has none. So the install happens here, once,
// after the extension is already running.

import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { chmod } from 'node:fs/promises';

/** What provisioning leaves behind: an interpreter with the server's imports in it. */
export interface Environment {
	python: vscode.Uri;
}

/**
 * Ensure the environment exists, building it if this version has not been
 * installed before.
 *
 * The stamp carries the extension version, so an update reruns `uv sync` against
 * the lockfile that shipped with it. uv resolves that to a no-op when nothing
 * actually changed, which is cheaper than working out whether anything did.
 */
export async function provision(
	context: vscode.ExtensionContext,
	log: vscode.OutputChannel
): Promise<Environment> {
	const home = context.globalStorageUri;
	const venv = vscode.Uri.joinPath(home, 'venv');
	const python =
		process.platform === 'win32'
			? vscode.Uri.joinPath(venv, 'Scripts', 'python.exe')
			: vscode.Uri.joinPath(venv, 'bin', 'python');

	const version = context.extension.packageJSON.version as string;
	const stamp = vscode.Uri.joinPath(home, `installed-${version}`);
	if (await exists(stamp)) {
		return { python };
	}

	await vscode.workspace.fs.createDirectory(home);
	const uv = await executable(context);

	// The whole environment lives under globalStorage rather than beside
	// pyproject.toml, because the extension directory is deleted and rewritten on
	// every update — a venv there would be thrown away with it, and a
	// multi-gigabyte reinstall is not something an update can afford.
	const env: NodeJS.ProcessEnv = {
		...process.env,
		UV_PROJECT_ENVIRONMENT: venv.fsPath,
		UV_CACHE_DIR: vscode.Uri.joinPath(home, 'cache').fsPath,
		UV_PYTHON_INSTALL_DIR: vscode.Uri.joinPath(home, 'python').fsPath,
		// Ignore whatever Python is on PATH and use one uv fetched itself. A
		// user's system interpreter is not a fixed target — it can be too new for
		// the wheels the lockfile pins, and it can be upgraded out from under us.
		UV_PYTHON_PREFERENCE: 'only-managed',
		UV_PYTHON_DOWNLOADS: 'automatic',
		NO_COLOR: '1',
	};

	log.appendLine(`installing the model environment into ${venv.fsPath}`);
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Authorship: installing the writing model',
		},
		(progress) => sync(uv.fsPath, context.extensionUri.fsPath, env, log, progress)
	);

	await vscode.workspace.fs.writeFile(stamp, new Uint8Array());
	return { python };
}

/**
 * The bundled uv, made runnable.
 *
 * Unpacking a VSIX does not preserve the executable bit, so a freshly installed
 * extension has a uv it cannot start until this has run.
 */
async function executable(context: vscode.ExtensionContext): Promise<vscode.Uri> {
	const uv = vscode.Uri.joinPath(
		context.extensionUri,
		'bin',
		process.platform === 'win32' ? 'uv.exe' : 'uv'
	);
	if (!(await exists(uv))) {
		throw new Error(
			`no uv binary at ${uv.fsPath} — this VSIX was built without one, or for another platform`
		);
	}
	if (process.platform !== 'win32') {
		await chmod(uv.fsPath, 0o755);
	}
	return uv;
}

/**
 * Run the install to completion.
 *
 * `--frozen` is what makes this an install rather than a resolve: the lockfile
 * shipped in the VSIX is taken as given, so what lands on a reader's machine is
 * what was tested, and a network that cannot reach an index fails here instead
 * of quietly resolving to something else. `--no-dev` leaves out the notebook
 * and plotting group, which is a large download nobody reading a novel needs.
 */
function sync(
	uv: string,
	cwd: string,
	env: NodeJS.ProcessEnv,
	log: vscode.OutputChannel,
	progress: vscode.Progress<{ message?: string }>
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(uv, ['sync', '--frozen', '--no-dev'], { cwd, env });

		// uv reports progress on stderr and results on stdout; both are the same
		// story to a reader waiting on a download, so both go to the log and the
		// most recent line goes to the notification.
		const report = (chunk: Buffer): void => {
			const text = chunk.toString();
			log.append(text);
			const last = text.trimEnd().split('\n').pop()?.trim();
			if (last) {
				progress.report({ message: last });
			}
		};
		child.stdout.on('data', report);
		child.stderr.on('data', report);

		child.on('error', reject);
		child.on('close', (code) =>
			code === 0 ? resolve() : reject(new Error(`uv sync exited with ${code}`))
		);
	});
}

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}
