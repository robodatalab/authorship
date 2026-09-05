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

export const FOLDED = "folded";

export const UNIQUE_CELL_ID = "id";

const MARKER = /^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$/;
const ATTR = /([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

function readAttributes(text: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    ATTR.lastIndex = 0;
    for (const found of text.matchAll(ATTR)) {
        attrs[found[1]] = found[2].replace(/\\(.)/g, "$1");
    }
    return attrs;
}

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

function trimBlankEnds(body: string[]): string {
    return body.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}
