// Putting a manuscript's parts on disk: the folder beside it, one file per part,
// and nothing left over from a division that made more of them. And the way back
// — the parts read in the order they were cut and put together as the manuscript
// again, over the top of it.
//
// The whole of the work is here and in model.ts. Cutting a manuscript along its
// own headings and counting the words is arithmetic — it asks nothing of a model,
// so it never leaves the editor.

import * as vscode from 'vscode';

import {
	PARTS_FOLDER,
	intoParts,
	mergeParts,
	partFileName,
	partNumber,
	readManuscript,
	renderPart,
	type WrittenPart,
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
		if (type === vscode.FileType.File && partNumber(name) !== null) {
			await vscode.workspace.fs.delete(vscode.Uri.joinPath(folder, name));
		}
	}
}

/** What a backmerge came to. */
export interface Merge {
	folder: vscode.Uri;
	parts: number;
}

/**
 * Put the parts back together over the manuscript they were cut from.
 *
 * The parts are the copy that has been written in since the division, so they are
 * what survives — the manuscript is replaced rather than reconciled. A folder
 * holding no parts is taken to mean exactly that, and the manuscript is left
 * alone rather than being overwritten with nothing.
 */
export async function mergeManuscript(manuscript: vscode.Uri): Promise<Merge> {
	const folder = vscode.Uri.joinPath(manuscript, '..', PARTS_FOLDER);
	const written = await readParts(folder);
	if (written.length === 0) {
		return { folder, parts: 0 };
	}

	await vscode.workspace.fs.writeFile(
		manuscript,
		new TextEncoder().encode(mergeParts(written))
	);
	return { folder, parts: written.length };
}

/** The parts in the folder, in the order they were cut. */
async function readParts(folder: vscode.Uri): Promise<WrittenPart[]> {
	let entries: [string, vscode.FileType][];
	try {
		entries = await vscode.workspace.fs.readDirectory(folder);
	} catch {
		// No folder at all, which is what a manuscript never divided looks like.
		return [];
	}

	const found = entries
		.filter(([, type]) => type === vscode.FileType.File)
		.map(([name]) => ({ name, number: partNumber(name) }))
		.filter((entry): entry is { name: string; number: number } => entry.number !== null)
		.sort((a, b) => a.number - b.number);

	const parts: WrittenPart[] = [];
	for (const { name, number } of found) {
		const bytes = await vscode.workspace.fs.readFile(
			vscode.Uri.joinPath(folder, name)
		);
		parts.push({ number, text: new TextDecoder().decode(bytes) });
	}
	return parts;
}
