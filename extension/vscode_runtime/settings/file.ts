// The workspace's settings file on disk: finding it, writing it the first time,
// reading it every time after, and noticing when the author edits it.
//
// The half of `settings/model.ts` that knows about VS Code. Everything about
// what a template *is* is over there, where it can be tested without an editor.

import * as vscode from 'vscode';

import {
	SETTINGS_FILE,
	SETTINGS_FOLDER,
	EMPTY_TEMPLATES,
	parseSettings,
	settingsText,
	type Templates,
} from './model';

/** Where a document's workspace keeps its settings, or nothing outside one. */
export function settingsUri(document: vscode.Uri): vscode.Uri | undefined {
	const project = vscode.workspace.getWorkspaceFolder(document);
	return project
		? vscode.Uri.joinPath(project.uri, SETTINGS_FOLDER, SETTINGS_FILE)
		: undefined;
}

/**
 * The templates this document's workspace builds its boilerplate pages from,
 * written out empty the first time a story in it is opened.
 *
 * The file is created rather than waited for because a template nobody knows
 * about is a template nobody writes: an author who opens `.author/settings.json`
 * and finds a slot for the disclaimer they have been retyping into every story
 * can put it there once, and one who never learns the file exists goes on
 * retyping it. It is written once — after that it is theirs, and nothing here
 * touches it again.
 *
 * A document opened from outside any workspace has no project to keep settings
 * in, and starts its pages empty with nothing written anywhere. Same for a
 * workspace that will not take the write: a folder opened read-only, or over a
 * remote that says no, is still a folder to write a story in.
 */
export async function loadTemplates(document: vscode.Uri): Promise<Templates> {
	const uri = settingsUri(document);
	if (!uri) {
		return EMPTY_TEMPLATES;
	}
	if (!(await exists(uri))) {
		await seed(uri);
		return EMPTY_TEMPLATES;
	}
	let text: string;
	try {
		text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
	} catch {
		return EMPTY_TEMPLATES;
	}
	try {
		return parseSettings(text);
	} catch (err) {
		// A file that is not JSON is a file the author has half-edited, and the
		// only sign they would otherwise get is a disclaimer that quietly came up
		// blank. Say so once, and carry on with a page to write in.
		void vscode.window.showWarningMessage(
			`${SETTINGS_FOLDER}/${SETTINGS_FILE} could not be read (${describe(err)}). ` +
				'Authorship is starting these pages empty until it is fixed.'
		);
		return EMPTY_TEMPLATES;
	}
}

/**
 * Call back whenever the workspace's settings file is written, by the author or
 * by anything else.
 *
 * The templates are read when a story is opened, and a story stays open for
 * days. Without this, editing the file and adding a disclaimer in the next
 * breath would still give you the old one.
 */
export function watchSettings(
	document: vscode.Uri,
	changed: () => void
): vscode.Disposable {
	const project = vscode.workspace.getWorkspaceFolder(document);
	if (!project) {
		return new vscode.Disposable(() => undefined);
	}
	const watcher = vscode.workspace.createFileSystemWatcher(
		new vscode.RelativePattern(project, `${SETTINGS_FOLDER}/${SETTINGS_FILE}`)
	);
	return vscode.Disposable.from(
		watcher.onDidCreate(changed),
		watcher.onDidChange(changed),
		watcher.onDidDelete(changed),
		watcher
	);
}

async function seed(uri: vscode.Uri): Promise<void> {
	try {
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
		await vscode.workspace.fs.writeFile(
			uri,
			new TextEncoder().encode(settingsText(EMPTY_TEMPLATES))
		);
	} catch {
		// Nowhere to keep them is not a reason to refuse to open the story.
	}
}

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

function describe(err: unknown): string {
	const message = (err as { message?: unknown } | null)?.message;
	return typeof message === 'string' ? message : String(err);
}
