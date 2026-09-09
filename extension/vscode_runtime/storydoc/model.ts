import type * as vscode from "vscode";

export const AUTHOR_FILE_EXTENSION = ".author";

export const MARKDOWN = "markdown";
export const CHAPTER = "chapter";
export const PART = "part";
export const TITLE_PAGE = "title-page";
export const IMAGE = "image";
export const CONTENTS = "contents";
export const DISCLAIMER = "disclaimer";
export const ABOUT = "about";
export const BLURB = "blurb";
export const NOTE = "note";
export const RECAP = "recap";

export const FOLDED = "folded";

export const UNIQUE_CELL_ID = "id";

const CELL_MARKER_LINE =
    /^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$/;
const MARKER_ATTRIBUTE =
    /([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

function readAttributes(marker: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    MARKER_ATTRIBUTE.lastIndex = 0;
    for (const [, attributeName, attributeValue] of marker.matchAll(
        MARKER_ATTRIBUTE,
    )) {
        attributes[attributeName] = attributeValue.replace(/\\(.)/g, "$1");
    }
    return attributes;
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
        const attributes = Object.entries(this.attrs)
            .map(
                ([attributeName, attributeValue]) =>
                    ` ${attributeName}="${attributeValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
            )
            .join("");
        return `<!-- cell: ${this.kind}${attributes} -->`;
    }

    isFolded(): boolean {
        return this.attrs[FOLDED] === "true";
    }

    fold(folded: boolean): void {
        if (this.isFolded() === folded) {
            return;
        }
        const attributes = { ...this.attrs };
        if (folded) {
            attributes[FOLDED] = "true";
        } else {
            delete attributes[FOLDED];
        }
        this.attrs = attributes;
    }

    replaceAttribute(attributeName: string, attributeValue: string): void {
        if (this.attrs[attributeName] === attributeValue) {
            return;
        }
        this.attrs = { ...this.attrs, [attributeName]: attributeValue };
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
        const sections: {
            markerLine: RegExpExecArray;
            proseLines: string[];
        }[] = [];

        for (const line of text.split("\n")) {
            const markerLine = CELL_MARKER_LINE.exec(line);
            if (markerLine) {
                sections.push({ markerLine, proseLines: [] });
            } else if (sections.length > 0) {
                sections[sections.length - 1].proseLines.push(line);
            }
        }

        this.documentCells = sections.map((section) => {
            const [, cellKind, markerAttributes] = section.markerLine;
            return new Cell(
                cellKind,
                withoutBlankLinesAtTheEnds(section.proseLines),
                readAttributes(markerAttributes),
            );
        });
    }

    dispose(): void {}

    get text(): string {
        return authorFileText(this.documentCells);
    }

    get cells(): Cell[] {
        return this.documentCells;
    }

    cellWithId(cellId: string): Cell | undefined {
        return this.documentCells.find((cell) => cell.uniqueId === cellId);
    }

    numCharactersInCell(cellId: string): number {
        return this.cellWithId(cellId)?.source.length ?? 0;
    }
    insertBefore(cellId: string | null, cell: Cell): void {
        const standsBefore = this.documentCells.findIndex(
            (inTheDocument) => inTheDocument.uniqueId === cellId,
        );
        this.insertAt(
            standsBefore < 0 ? this.documentCells.length : standsBefore,
            cell,
        );
    }

    removeCell(cellId: string): void {
        this.removeCellsAt(
            this.documentCells.findIndex((cell) => cell.uniqueId === cellId),
            1,
        );
    }

    insertAt(cellIndex: number, cell: Cell): void {
        this.documentCells.splice(
            cellIndex,
            0,
            new Cell(cell.kind, cell.source, cell.attrs),
        );
    }

    moveCellsAt(cellIndex: number, howMany: number, toCellIndex: number): void {
        const moved = this.documentCells.splice(cellIndex, howMany);
        this.documentCells.splice(
            toCellIndex > cellIndex ? toCellIndex - howMany : toCellIndex,
            0,
            ...moved,
        );
    }

    removeCellsAt(cellIndex: number, howMany: number): void {
        if (cellIndex < 0 || cellIndex >= this.documentCells.length) {
            return;
        }
        this.documentCells.splice(cellIndex, howMany);
    }
}

export function authorFileText(cells: readonly Cell[]): string {
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

function withoutBlankLinesAtTheEnds(proseLines: string[]): string {
    return proseLines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}
