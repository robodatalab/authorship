// Builds the Python environment the model server runs in, on the user's machine,
// the first time a released extension starts.
//
// None of that environment can travel in the VSIX. torch, transformers and spacy
// resolve to platform-specific wheels measured in gigabytes, and the interpreter
// is not ours to ship either. What travels is the server source and the
// lockfile, which are the same bytes everywhere; the machine-specific half —
// uv, a CPython, and the wheels — is fetched here, once, for whatever machine
// this turns out to be. That is what keeps the VSIX to one file for every
// platform.

import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { chmod } from 'node:fs/promises';

/** Pin a release by naming it here: `download/0.9.29` in place of `latest/download`. */
const UV_RELEASE = 'latest/download';

/** What provisioning leaves behind: an interpreter with the server's imports in it. */
export interface Environment {
	python: vscode.Uri;
}

type Report = vscode.Progress<{ message?: string }>;

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

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Authorship: installing the writing model',
		},
		async (progress) => {
			const uv = await installer(home, log, progress);
			log.appendLine(`installing the model environment into ${venv.fsPath}`);
			// `--frozen` is what makes this an install rather than a resolve: the
			// lockfile shipped in the VSIX is taken as given, so what lands on a
			// reader's machine is what was tested. `--no-dev` leaves out the
			// notebook and plotting group, which is a large download nobody
			// reading a novel needs.
			await run(uv.fsPath, ['sync', '--frozen', '--no-dev'], context.extensionUri.fsPath, env, log, progress);
		}
	);

	await vscode.workspace.fs.writeFile(stamp, new Uint8Array());
	return { python };
}

/**
 * uv, downloaded for this machine and kept.
 *
 * It outlives the extension version that fetched it — it is the thing that knows
 * how to build environments, not part of any one of them.
 */
async function installer(
	home: vscode.Uri,
	log: vscode.OutputChannel,
	progress: Report
): Promise<vscode.Uri> {
	const windows = process.platform === 'win32';
	const into = vscode.Uri.joinPath(home, 'uv');
	const uv = vscode.Uri.joinPath(into, windows ? 'uv.exe' : 'uv');
	if (await exists(uv)) {
		return uv;
	}

	const name = `uv-${target()}${windows ? '.zip' : '.tar.gz'}`;
	const url = `https://github.com/astral-sh/uv/releases/${UV_RELEASE}/${name}`;
	log.appendLine(`fetching ${url}`);
	progress.report({ message: 'fetching the installer' });

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url} answered ${response.status}`);
	}
	const archive = vscode.Uri.joinPath(home, name);
	await vscode.workspace.fs.writeFile(archive, new Uint8Array(await response.arrayBuffer()));
	await vscode.workspace.fs.createDirectory(into);

	// `tar` reads both formats and ships with macOS, Linux and Windows alike, so
	// unpacking needs nothing the machine does not already have. Only the tarball
	// carries a directory to strip; the zip is flat.
	const strip = windows ? [] : ['--strip-components=1'];
	await run('tar', ['-xf', archive.fsPath, '-C', into.fsPath, ...strip], home.fsPath, process.env, log);
	await vscode.workspace.fs.delete(archive);

	if (!windows) {
		await chmod(uv.fsPath, 0o755);
	}
	return uv;
}

/** The uv build for this machine, named the way its releases are. */
function target(): string {
	switch (`${process.platform}-${process.arch}`) {
		case 'darwin-arm64':
			return 'aarch64-apple-darwin';
		case 'darwin-x64':
			return 'x86_64-apple-darwin';
		case 'linux-x64':
			return 'x86_64-unknown-linux-gnu';
		case 'linux-arm64':
			return 'aarch64-unknown-linux-gnu';
		case 'win32-x64':
			return 'x86_64-pc-windows-msvc';
		case 'win32-arm64':
			return 'aarch64-pc-windows-msvc';
		default:
			throw new Error(`no uv build for ${process.platform}-${process.arch}`);
	}
}

/** Run a command to completion, with everything it says going to the log. */
function run(
	command: string,
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
	log: vscode.OutputChannel,
	progress?: Report
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, env });

		// uv reports progress on stderr and results on stdout; both are the same
		// story to a reader waiting on a download, so both go to the log and the
		// most recent line goes to the notification.
		const write = (chunk: Buffer): void => {
			const text = chunk.toString();
			log.append(text);
			const last = text.trimEnd().split('\n').pop()?.trim();
			if (last) {
				progress?.report({ message: last });
			}
		};
		child.stdout.on('data', write);
		child.stderr.on('data', write);

		child.on('error', reject);
		child.on('close', (code) =>
			code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))
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
