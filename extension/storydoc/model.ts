// A story and the layout it is published in, in one human-readable file.
//
// The file is `<name>.author`, and it is markdown. What makes it a story
// document is that the markdown is cut into cells, each opened by a marker that
// says what the cell *is*:
//
//     <!-- cell: chapter title="The First Night" -->
//
//     The lantern had gone out again.
//
//     <!-- cell: cover src="art/cover.jpg" -->
//
//     ![Cover](art/cover.jpg)
//
// The marker is an HTML comment, so every reader that renders markdown renders
// the document and shows none of the scaffolding, and every editor that opens
// text can edit it. There is no custom editor a person is obliged to use.
//
// Two properties are load-bearing:
//
// **The format is open.** A cell's kind is any name, and this module knows
// nothing about most of them. An unrecognised kind is carried through parse and
// save untouched, so a document written by a newer version — or by hand —
// survives a round trip through an older one rather than losing cells.
//
// **Plain markdown is already a story document.** A file with no markers parses
// as one `markdown` cell holding the lot.
//
// This is the same format `server/storydoc.py` reads, and the two must agree —
// the round-trip and parsing rules are mirrored there test for test. Deliberately
// free of the `vscode` module, so it can be unit tested without an editor.

export const EXTENSION = ".author";

export const MARKDOWN = "markdown";
export const CHAPTER = "chapter";
export const PART = "part";
export const TITLE_PAGE = "title-page";
export const COVER = "cover";
export const CONTENTS = "contents";
export const DISCLAIMER = "disclaimer";
export const ABOUT = "about";
export const BLURB = "blurb";
export const NOTE = "note";
export const RECAP = "recap";

/** What an attribute says when the answer to it is no. */
export const NO = "no";

/** Whether a part is printed as a page of the book. */
export const PRINT = "print";

/**
 * One thing the document is made of, and what it says it is.
 *
 * `kind` is the cell's identity and is never inferred from its text — a chapter
 * called "Disclaimer" is still a chapter. `attrs` is whatever the kind needs said
 * about it, and is kept even when this module has no use for it.
 */
export interface Cell {
    kind: string;
    source: string;
    attrs: Record<string, string>;
}

export class AuthorDocument {
    private static readonly MARKER =
        /^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$/;
    private static readonly ATTR =
        /([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

    private documentCells: Cell[];
    private readonly cellsBefore: Cell[][] = [];
    private readonly cellsUndone: Cell[][] = [];
    private readonly changeListeners: (() => void)[] = [];

    private constructor(cells: Cell[]) {
        this.documentCells = cells;
    }

    static fromText(text: string): AuthorDocument {
        const cells: Cell[] = [];
        let kind = MARKDOWN;
        let attrs: Record<string, string> = {};
        let body: string[] = [];

        const close = (): void => {
            const source = AuthorDocument.trimBlankEnds(body);
            // The run of text above the first marker is only a cell if the author
            // wrote something there; a document that opens with a marker does not
            // start with an empty one.
            if (
                source ||
                cells.length > 0 ||
                kind !== MARKDOWN ||
                Object.keys(attrs).length > 0
            ) {
                cells.push({ kind, source, attrs: { ...attrs } });
            }
        };

        for (const line of text.split("\n")) {
            const marker = AuthorDocument.MARKER.exec(line);
            if (!marker) {
                body.push(line);
                continue;
            }
            close();
            kind = marker[1];
            attrs = AuthorDocument.readAttrs(marker[2]);
            body = [];
        }
        close();
        return new AuthorDocument(cells);
    }

    get cells(): Cell[] {
        return this.documentCells;
    }

    toText(): string {
        const out: string[] = [];
        for (const cell of this.documentCells) {
            out.push(AuthorDocument.markerFor(cell));
            out.push("");
            if (cell.source) {
                out.push(cell.source);
                out.push("");
            }
        }
        return out.join("\n");
    }

    replaceCellMarkdown(cellIndex: number, markdown: string): void {
        const cell = this.documentCells[cellIndex];
        if (cell === undefined || cell.source === markdown) {
            return;
        }
        this.recordChange(
            this.documentCells.map((existing, at) =>
                at === cellIndex ? { ...existing, source: markdown } : existing,
            ),
        );
    }

    canUndo(): boolean {
        return this.cellsBefore.length > 0;
    }

    canRedo(): boolean {
        return this.cellsUndone.length > 0;
    }

    undo(): void {
        const previous = this.cellsBefore.pop();
        if (previous === undefined) {
            return;
        }
        this.cellsUndone.push(this.documentCells);
        this.documentCells = previous;
        this.notifyChanged();
    }

    redo(): void {
        const next = this.cellsUndone.pop();
        if (next === undefined) {
            return;
        }
        this.cellsBefore.push(this.documentCells);
        this.documentCells = next;
        this.notifyChanged();
    }

    onChanged(listener: () => void): void {
        this.changeListeners.push(listener);
    }

    private recordChange(cells: Cell[]): void {
        this.cellsBefore.push(this.documentCells);
        this.cellsUndone.length = 0;
        this.documentCells = cells;
        this.notifyChanged();
    }

    private notifyChanged(): void {
        for (const listener of this.changeListeners) {
            listener();
        }
    }

    private static readAttrs(text: string): Record<string, string> {
        const attrs: Record<string, string> = {};
        // `matchAll` on a /g regex needs the index reset; the literal is shared.
        AuthorDocument.ATTR.lastIndex = 0;
        for (const found of text.matchAll(AuthorDocument.ATTR)) {
            attrs[found[1]] = found[2].replace(/\\(.)/g, "$1");
        }
        return attrs;
    }

    private static markerFor(cell: Cell): string {
        const said = Object.entries(cell.attrs)
            .map(
                ([name, value]) =>
                    ` ${name}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
            )
            .join("");
        return `<!-- cell: ${cell.kind}${said} -->`;
    }

    /** Python's `"\n".join(body).strip("\n")` — blank lines off both ends, nothing else. */
    private static trimBlankEnds(body: string[]): string {
        return body.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    }
}
