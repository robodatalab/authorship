// Putting a manuscript's parts on disk: the folder beside it, one file per part,
// and nothing left over from a division that made more of them.
//
// The whole of the work is here and in model.ts. Cutting a manuscript along its
// own headings and counting the words is arithmetic — it asks nothing of a model,
// so it never leaves the editor.

import * as vscode from 'vscode';

import {
	PARTS_FOLDER,
	intoParts,
	isPartFile,
	partFileName,
	readManuscript,
	renderPart,
} from './model';

/** What a division came to. */
export interface Division {
	folder: vscode.Uri;
	parts: number;
}

export async function divideManuscript(
	manuscript: vscode.Uri,
	quota: number
): Promise<Division> {
	const bytes = await vscode.workspace.fs.readFile(manuscript);
	const { title, sections } = readManuscript(new TextDecoder().decode(bytes));
	const parts = intoParts(sections, quota);

	const folder = vscode.Uri.joinPath(manuscript, '..', PARTS_FOLDER);
	if (parts.length === 0) {
		return { folder, parts: 0 };
	}

	await vscode.workspace.fs.createDirectory(folder);
	await clearParts(folder);

	// Sequentially, so a folder half-written by two divisions racing is not a
	// state anyone has to reason about.
	for (const [index, part] of parts.entries()) {
		const number = index + 1;
		await vscode.workspace.fs.writeFile(
			vscode.Uri.joinPath(folder, partFileName(number)),
			new TextEncoder().encode(renderPart(title, number, part))
		);
	}

	return { folder, parts: parts.length };
}

/** Take out what an earlier division left, and only that — whatever else is in
 *  the folder was put there by someone else. */
async function clearParts(folder: vscode.Uri): Promise<void> {
	const entries = await vscode.workspace.fs.readDirectory(folder);
	for (const [name, type] of entries) {
		if (type === vscode.FileType.File && isPartFile(name)) {
			await vscode.workspace.fs.delete(vscode.Uri.joinPath(folder, name));
		}
	}
}
