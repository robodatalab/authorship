// Putting a story's parts on disk: the folder beside it, one file per part, and
// nothing left over from a division that made more of them.
//
// The whole of the work is here and in manuscript_parts.ts. Cutting a story
// where its own Parts stand is bookkeeping — it asks nothing of a model, so it never leaves
// the editor.

import * as vscode from "vscode";

import {
    PARTS_FOLDER,
    furnitureOf,
    intoParts,
    partCells,
    partFileName,
    partNumber,
    sectionsOf,
} from "./manuscript_parts";
import { type ImmutableCell } from "../storydoc/model";

/** What a division came to. */
export interface DividedManuscript {
    partsFolder: vscode.Uri;
    partFilesWritten: number;
}

/**
 * Cut the story into `parts/` beside the document it came from.
 *
 * The cells are handed in rather than a file being read back, and the parts go
 * out in the same format they came in. A part is a story document like any
 * other, so exporting one to an EPUB is the export that already exists rather
 * than a second way of building a book.
 *
 * There is nothing to ask the author: the cuts fall where they put the Parts,
 * and a story with none divides into nothing.
 */

function authorFileText(cells: readonly ImmutableCell[]): string {
    const lines: string[] = [];
    for (const cell of cells) {
        lines.push(cell.marker());
        lines.push("");
        if (cell.source) {
            lines.push(cell.source);
            lines.push("");
        }
    }
    return lines.join("\n");
}

export async function divideManuscript(
    document: vscode.Uri,
    cells: readonly ImmutableCell[],
): Promise<DividedManuscript> {
    const parts = intoParts(sectionsOf(cells));
    const partsFolder = vscode.Uri.joinPath(document, "..", PARTS_FOLDER);
    if (parts.length === 0) {
        return { partsFolder, partFilesWritten: 0 };
    }

    const furniture = furnitureOf(cells);
    await vscode.workspace.fs.createDirectory(partsFolder);
    await clearParts(partsFolder);

    // Sequentially, so a folder half-written by two divisions racing is not a
    // state anyone has to reason about.
    for (const [index, part] of parts.entries()) {
        const number = index + 1;
        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(partsFolder, partFileName(number)),
            new TextEncoder().encode(
                authorFileText(partCells(furniture, number, part)),
            ),
        );
    }

    return { partsFolder, partFilesWritten: parts.length };
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
