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

import type * as vscode from "vscode";

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

/** Whether a section is folded away to its heading. */
export const FOLDED = "folded";

export const UNIQUE_CELL_ID = "id";

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
    constructor(
        public kind: string,
        public source: string,
        public attrs: Record<string, string>,
    ) {
        if (!attrs[UNIQUE_CELL_ID]) {
            this.attrs = { ...attrs, [UNIQUE_CELL_ID]: crypto.randomUUID() };
        }
    }

    get uniqueId(): string {
        return this.attrs[UNIQUE_CELL_ID];
    }

    replaceMarkdown(markdown: string): void {
        if (this.source === markdown) {
            return;
        }
        this.source = markdown;
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

    isFolded(): boolean {
        return this.attrs[FOLDED] === "true";
    }

    fold(folded: boolean): void {
        if (this.isFolded() === folded) {
            return;
        }
        const attrs = { ...this.attrs };
        if (folded) {
            attrs[FOLDED] = "true";
        } else {
            delete attrs[FOLDED];
        }
        this.attrs = attrs;
    }

    replaceAttribute(name: string, value: string): void {
        if (this.attrs[name] === value) {
            return;
        }
        this.attrs = { ...this.attrs, [name]: value };
    }
}

export class AuthorDocument implements vscode.CustomDocument {
    private documentCells: Cell[];
    constructor(
        readonly uri: vscode.Uri,
        text: string,
    ) {
        this.documentCells = [];
        this.fromText(text);
    }

    /** The document VS Code holds when there is no file behind it: the webview's. */
    static fromText(text: string): AuthorDocument {
        return new AuthorDocument(undefined as unknown as vscode.Uri, text);
    }

    fromText(text: string): void {
        const sections: { marker: RegExpExecArray; body: string[] }[] = [];

        for (const line of text.split("\n")) {
            const marker = MARKER.exec(line);
            if (marker) {
                sections.push({ marker, body: [] });
            } else if (sections.length > 0) {
                sections[sections.length - 1].body.push(line);
            }
        }

        this.documentCells = sections.map(
            (section) =>
                new Cell(
                    section.marker[1],
                    trimBlankEnds(section.body),
                    readAttributes(section.marker[2]),
                ),
        );
    }

    dispose(): void {}

    get text(): string {
        return this.toText();
    }

    get cells(): Cell[] {
        return this.documentCells;
    }

    insertAt(at: number, cell: Cell): void {
        this.documentCells.splice(
            at,
            0,
            new Cell(cell.kind, cell.source, cell.attrs),
        );
    }

    moveAt(at: number, to: number): void {
        if (to === at || to < 0 || to >= this.documentCells.length) {
            return;
        }
        const [moved] = this.documentCells.splice(at, 1);
        this.documentCells.splice(to, 0, moved);
    }

    removeAt(at: number): void {
        if (at < 0 || at >= this.documentCells.length) {
            return;
        }
        this.documentCells.splice(at, 1);
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
}

/** Python's `"\n".join(body).strip("\n")` — blank lines off both ends, nothing else. */
function trimBlankEnds(body: string[]): string {
    return body.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}
