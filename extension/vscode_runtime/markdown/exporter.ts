import {
    ABOUT,
    AuthorDocument,
    BLURB,
    CHAPTER,
    Cell,
    IMAGE,
    MARKDOWN,
    NOTE,
    PART,
    RECAP,
    TITLE_PAGE,
} from "../storydoc/model";

const KINDS_WRITTEN_AS_HEADINGS: string[] = [TITLE_PAGE, PART, CHAPTER];

const MARKDOWN_HEADING = /^(#{1,3})\s+(.*)$/;

const KINDS_WRITTEN_AS_COMMENTS: string[] = [NOTE];

const KINDS_LEFT_OUT_OF_THE_MANUSCRIPT: string[] = [NOTE, BLURB, RECAP];

const AUTHOR_LINK_ATTRIBUTES: [string, string][] = [
    ["kdp", "Books on Amazon"],
    ["website", "Website"],
    ["substack", "Substack"],
];

function headingHashesFor(cellKind: string): string {
    return "#".repeat(KINDS_WRITTEN_AS_HEADINGS.indexOf(cellKind) + 1);
}

function insideAnHtmlComment(prose: string): string {
    return `<!--\n${prose.replace(/-->/g, "--&gt;")}\n-->`;
}

function titlePageMarkdown(cell: Cell): string[] {
    const lines = [
        `${headingHashesFor(TITLE_PAGE)} ${cell.attrs.title || "Untitled"}`,
    ];
    if (cell.attrs.subtitle) {
        lines.push(`*${cell.attrs.subtitle}*`);
    }
    const credits = ["author", "publisher", "date", "version", "isbn"]
        .map((attributeName) => cell.attrs[attributeName])
        .filter(Boolean);
    if (credits.length > 0) {
        lines.push(credits.join(" · "));
    }
    return lines;
}

function aboutTheAuthorMarkdown(cell: Cell): string[] {
    const lines: string[] = [];
    if (cell.source) {
        lines.push(cell.source);
    }
    const links = AUTHOR_LINK_ATTRIBUTES.filter(
        ([attributeName]) => cell.attrs[attributeName],
    ).map(
        ([attributeName, label]) => `[${label}](${cell.attrs[attributeName]})`,
    );
    if (links.length > 0) {
        lines.push(links.join(" · "));
    }

    return lines.length > 0
        ? [`${headingHashesFor(CHAPTER)} About the Author`, ...lines]
        : [];
}

export function fromMarkdown(markdown: string): string {
    const document = AuthorDocument.fromText("");
    for (const cell of cellsReadFromMarkdown(markdown)) {
        document.insertAt(document.cells.length, cell);
    }
    return document.text;
}

function cellsReadFromMarkdown(markdown: string): Cell[] {
    const cells: Cell[] = [];
    let proseSinceTheLastHeading: string[] = [];

    const closeTheProseCell = (): void => {
        const prose = proseSinceTheLastHeading.join("\n").trim();
        if (prose) {
            cells.push(new Cell(MARKDOWN, prose, {}));
        }
        proseSinceTheLastHeading = [];
    };

    for (const line of markdown.split("\n")) {
        const heading = MARKDOWN_HEADING.exec(line.trim());
        if (!heading) {
            proseSinceTheLastHeading.push(line);
            continue;
        }
        const [, hashes, headingText] = heading;
        closeTheProseCell();
        cells.push(
            new Cell(KINDS_WRITTEN_AS_HEADINGS[hashes.length - 1], "", {
                title: headingText.trim(),
            }),
        );
    }
    closeTheProseCell();
    return cells;
}

export function toMarkdown(cells: Cell[]): string {
    const manuscript: string[] = [];
    for (const cell of cells) {
        if (KINDS_WRITTEN_AS_COMMENTS.includes(cell.kind)) {
            if (cell.source) {
                manuscript.push(insideAnHtmlComment(cell.source));
            }
            continue;
        }

        if (KINDS_LEFT_OUT_OF_THE_MANUSCRIPT.includes(cell.kind)) {
            continue;
        }
        if (cell.kind === TITLE_PAGE) {
            manuscript.push(...titlePageMarkdown(cell));
            continue;
        }
        if (cell.kind === PART || cell.kind === CHAPTER) {
            manuscript.push(
                `${headingHashesFor(cell.kind)} ${cell.attrs.title || "Untitled"}`,
            );
            continue;
        }
        if (cell.kind === ABOUT) {
            manuscript.push(...aboutTheAuthorMarkdown(cell));
            continue;
        }
        if (cell.kind === IMAGE) {
            if (cell.attrs.src) {
                manuscript.push(`![](${cell.attrs.src})`);
            }
            continue;
        }

        if (cell.attrs.title) {
            manuscript.push(`${headingHashesFor(CHAPTER)} ${cell.attrs.title}`);
        }
        if (cell.source) {
            manuscript.push(cell.source);
        }
    }
    return manuscript.join("\n\n") + (manuscript.length > 0 ? "\n" : "");
}
