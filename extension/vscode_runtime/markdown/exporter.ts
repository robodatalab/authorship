import {
    ABOUT,
    AuthorDocument,
    BLURB,
    CHAPTER,
    Cell,
    MARKDOWN,
    NOTE,
    PART,
    RECAP,
    TITLE_PAGE,
} from "../storydoc/model";

const LEVELS: string[] = [TITLE_PAGE, PART, CHAPTER];

const HEADING = /^(#{1,3})\s+(.*)$/;

const ASIDES: string[] = [NOTE];

const UNPUBLISHED: string[] = [NOTE, BLURB, RECAP];

const AUTHOR_LINKS: [string, string][] = [
    ["kdp", "Books on Amazon"],
    ["website", "Website"],
    ["substack", "Substack"],
];

function headingFor(kind: string): string {
    return "#".repeat(LEVELS.indexOf(kind) + 1);
}

function commented(source: string): string {
    return `<!--\n${source.replace(/-->/g, "--&gt;")}\n-->`;
}

function titlePageMarkdown(cell: Cell): string[] {
    const out = [`${headingFor(TITLE_PAGE)} ${cell.attrs.title || "Untitled"}`];
    if (cell.attrs.subtitle) {
        out.push(`*${cell.attrs.subtitle}*`);
    }
    const credits = ["author", "publisher", "date", "version", "isbn"]
        .map((name) => cell.attrs[name])
        .filter(Boolean);
    if (credits.length > 0) {
        out.push(credits.join(" · "));
    }
    return out;
}

function aboutMarkdown(cell: Cell): string[] {
    const said: string[] = [];
    if (cell.source) {
        said.push(cell.source);
    }
    const links = AUTHOR_LINKS.filter(([name]) => cell.attrs[name]).map(
        ([name, label]) => `[${label}](${cell.attrs[name]})`,
    );
    if (links.length > 0) {
        said.push(links.join(" · "));
    }

    return said.length > 0
        ? [`${headingFor(CHAPTER)} About the Author`, ...said]
        : [];
}

export function fromMarkdown(markdown: string): string {
    const document = AuthorDocument.fromText("");
    for (const cell of cellsFromMarkdown(markdown)) {
        document.insertAt(document.cells.length, cell);
    }
    return document.toText();
}

function cellsFromMarkdown(text: string): Cell[] {
    const cells: Cell[] = [];
    let prose: string[] = [];

    const flush = (): void => {
        const source = prose.join("\n").trim();
        if (source) {
            cells.push(new Cell(MARKDOWN, source, {}));
        }
        prose = [];
    };

    for (const line of text.split("\n")) {
        const heading = HEADING.exec(line.trim());
        if (!heading) {
            prose.push(line);
            continue;
        }
        flush();
        cells.push(
            new Cell(LEVELS[heading[1].length - 1], "", {
                title: heading[2].trim(),
            }),
        );
    }
    flush();
    return cells;
}

export function toMarkdown(cells: Cell[]): string {
    const out: string[] = [];
    for (const cell of cells) {
        if (ASIDES.includes(cell.kind)) {
            if (cell.source) {
                out.push(commented(cell.source));
            }
            continue;
        }

        if (UNPUBLISHED.includes(cell.kind)) {
            continue;
        }
        if (cell.kind === TITLE_PAGE) {
            out.push(...titlePageMarkdown(cell));
            continue;
        }
        if (cell.kind === PART || cell.kind === CHAPTER) {
            out.push(
                `${headingFor(cell.kind)} ${cell.attrs.title || "Untitled"}`,
            );
            continue;
        }
        if (cell.kind === ABOUT) {
            out.push(...aboutMarkdown(cell));
            continue;
        }

        if (cell.attrs.title) {
            out.push(`${headingFor(CHAPTER)} ${cell.attrs.title}`);
        }
        if (cell.source) {
            out.push(cell.source);
        }
    }
    return out.join("\n\n") + (out.length > 0 ? "\n" : "");
}
