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

const MARKER = /^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$/;
const ATTR = /([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

function readAttributes(text: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    // `matchAll` on a /g regex needs the index reset; the literal is shared.
    ATTR.lastIndex = 0;
    for (const found of text.matchAll(ATTR)) {
        attrs[found[1]] = found[2].replace(/\\(.)/g, "$1");
    }
    return attrs;
}

/**
 * One thing the document is made of, and what it says it is.
 *
 * `kind` is the cell's identity and is never inferred from its text — a chapter
 * called "Disclaimer" is still a chapter. `attrs` is whatever the kind needs said
 * about it, and is kept even when this module has no use for it.
 */
export class Cell {
    #changed: () => void;

    constructor(
        public kind: string,
        public source: string,
        public attrs: Record<string, string>,
        changed: () => void = () => {},
    ) {
        this.#changed = changed;
    }

    replaceMarkdown(markdown: string): void {
        if (this.source === markdown) {
            return;
        }
        this.source = markdown;
        this.#changed();
    }

    marker(): string {
        const said = Object.entries(this.attrs)
            .map(
                ([name, value]) =>
                    ` ${name}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
            )
            .join("");
        return `<!-- cell: ${this.kind}${said} -->`;
    }

    replaceAttribute(name: string, value: string): void {
        if (this.attrs[name] === value) {
            return;
        }
        this.attrs = { ...this.attrs, [name]: value };
        this.#changed();
    }
}

export class AuthorDocument {
    private documentCells: Cell[];
    private readonly changeListeners: (() => void)[] = [];

    private constructor(cells: Cell[]) {
        this.documentCells = cells;
    }

    static fromText(text: string): AuthorDocument {
        const document = new AuthorDocument([]);
        const sections: { marker: RegExpExecArray; body: string[] }[] = [];

        for (const line of text.split("\n")) {
            const marker = MARKER.exec(line);
            if (marker) {
                sections.push({ marker, body: [] });
            } else if (sections.length > 0) {
                sections[sections.length - 1].body.push(line);
            }
        }

        const changed = (): void => document.notifyChanged();
        const cells: Cell[] = [];
        for (const section of sections) {
            cells.push(
                new Cell(
                    section.marker[1],
                    trimBlankEnds(section.body),
                    readAttributes(section.marker[2]),
                    changed,
                ),
            );
        }

        document.documentCells = cells;
        return document;
    }

    get cells(): Cell[] {
        return this.documentCells;
    }

    insertAt(at: number, cell: Cell): void {
        this.documentCells.splice(
            at,
            0,
            new Cell(cell.kind, cell.source, cell.attrs, () =>
                this.notifyChanged(),
            ),
        );
        this.notifyChanged();
    }

    moveAt(at: number, to: number): void {
        if (to === at || to < 0 || to >= this.documentCells.length) {
            return;
        }
        const [moved] = this.documentCells.splice(at, 1);
        this.documentCells.splice(to, 0, moved);
        this.notifyChanged();
    }

    removeAt(at: number): void {
        if (at < 0 || at >= this.documentCells.length) {
            return;
        }
        this.documentCells.splice(at, 1);
        this.notifyChanged();
    }

    toText(): string {
        const out: string[] = [];
        for (const cell of this.documentCells) {
            out.push(cell.marker());
            out.push("");
            if (cell.source) {
                out.push(cell.source);
                out.push("");
            }
        }
        return out.join("\n");
    }

    onChanged(listener: () => void): void {
        this.changeListeners.push(listener);
    }

    notifyChanged(): void {
        for (const listener of this.changeListeners) {
            listener();
        }
    }
}

/** Python's `"\n".join(body).strip("\n")` — blank lines off both ends, nothing else. */
function trimBlankEnds(body: string[]): string {
    return body.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}
