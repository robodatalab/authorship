import { dumps } from "../storydoc/storydoc";
import type { AboutCell } from "../storydoc/cells/about_cell";
import type { BlurbCell } from "../storydoc/cells/blurb_cell";
import type { Cell } from "../storydoc/cells/cell";
import type { CellVisitor } from "../storydoc/cells/cell_visitor";
import { ChapterCell } from "../storydoc/cells/chapter_cell";
import type { DisclaimerCell } from "../storydoc/cells/disclaimer_cell";
import type { DividerCell } from "../storydoc/cells/divider_cell";
import type { ImageCell } from "../storydoc/cells/image_cell";
import { MarkdownCell } from "../storydoc/cells/markdown_cell";
import type { NoteCell } from "../storydoc/cells/note_cell";
import { PartCell } from "../storydoc/cells/part_cell";
import type { PlotCell } from "../storydoc/cells/plot_cell";
import type { RecapCell } from "../storydoc/cells/recap_cell";
import type { SalientConceptCell } from "../storydoc/cells/salient_concept_cell";
import type { TableOfContentsCell } from "../storydoc/cells/table_of_contents_cell";
import { TitlePageCell } from "../storydoc/cells/title_page_cell";
import type { UnknownCell } from "../storydoc/cells/unknown_cell";

const TITLE_PAGE_HEADING = "#";
const PART_HEADING = "##";
const CHAPTER_HEADING = "###";

const MARKDOWN_HEADING = /^(#{1,3})\s+(.*)$/;

const UNTITLED = "Untitled";

function insideAnHtmlComment(prose: string): string {
    return `<!--\n${prose.replace(/-->/g, "--&gt;")}\n-->`;
}

class ManuscriptMarkdown implements CellVisitor<string[]> {
    visitMarkdown(cell: MarkdownCell): string[] {
        return cell.source ? [cell.source] : [];
    }

    visitChapter(cell: ChapterCell): string[] {
        return [`${CHAPTER_HEADING} ${cell.title || UNTITLED}`];
    }

    visitPart(cell: PartCell): string[] {
        return [`${PART_HEADING} ${cell.title || UNTITLED}`];
    }

    visitTitlePage(cell: TitlePageCell): string[] {
        const lines = [`${TITLE_PAGE_HEADING} ${cell.title || UNTITLED}`];
        if (cell.subtitle) {
            lines.push(`*${cell.subtitle}*`);
        }
        const credits = [
            cell.author,
            cell.publisher,
            cell.date,
            cell.version,
            cell.isbn,
        ].filter(Boolean);
        if (credits.length > 0) {
            lines.push(credits.join(" · "));
        }
        return lines;
    }

    visitImage(cell: ImageCell): string[] {
        return cell.src ? [`![](${cell.src})`] : [];
    }

    visitTableOfContents(cell: TableOfContentsCell): string[] {
        return cell.source ? [cell.source] : [];
    }

    visitDisclaimer(cell: DisclaimerCell): string[] {
        const lines: string[] = [];
        if (cell.title) {
            lines.push(`${CHAPTER_HEADING} ${cell.title}`);
        }
        if (cell.source) {
            lines.push(cell.source);
        }
        return lines;
    }

    visitAbout(cell: AboutCell): string[] {
        const authorLinks: [string, string][] = [
            ["Books on Amazon", cell.kdp],
            ["Website", cell.website],
            ["Substack", cell.substack],
        ];
        const links = authorLinks
            .filter(([, link]) => link)
            .map(([label, link]) => `[${label}](${link})`);
        const lines: string[] = [];
        if (links.length > 0) {
            lines.push(links.join(" · "));
        }
        if (cell.source) {
            lines.push(cell.source);
        }
        return lines.length > 0
            ? [`${CHAPTER_HEADING} About the Author`, ...lines]
            : [];
    }

    visitNote(cell: NoteCell): string[] {
        return cell.source ? [insideAnHtmlComment(cell.source)] : [];
    }

    visitUnknown(cell: UnknownCell): string[] {
        return cell.source ? [cell.source] : [];
    }

    visitDivider(_cell: DividerCell): string[] {
        return [];
    }

    visitBlurb(_cell: BlurbCell): string[] {
        return [];
    }

    visitRecap(_cell: RecapCell): string[] {
        return [];
    }

    visitSalientConcept(_cell: SalientConceptCell): string[] {
        return [];
    }

    visitPlot(_cell: PlotCell): string[] {
        return [];
    }
}

export function toMarkdown(cells: readonly Cell[]): string {
    const manuscriptMarkdown = new ManuscriptMarkdown();
    const manuscript = cells.flatMap((cell) => cell.accept(manuscriptMarkdown));
    return manuscript.join("\n\n") + (manuscript.length > 0 ? "\n" : "");
}

export function fromMarkdown(markdown: string): string {
    const cells = cellsReadFromMarkdown(markdown);
    return dumps(cells);
}

function cellsReadFromMarkdown(markdown: string): Cell[] {
    const cells: Cell[] = [];
    let proseSinceTheLastHeading: string[] = [];

    const closeTheProseCell = (): void => {
        const prose = proseSinceTheLastHeading.join("\n").trim();
        if (prose) {
            cells.push(new MarkdownCell(prose));
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
        const title = headingText.trim();
        closeTheProseCell();
        switch (hashes) {
            case TITLE_PAGE_HEADING:
                cells.push(new TitlePageCell(title));
                break;
            case PART_HEADING:
                cells.push(new PartCell(title));
                break;
            default:
                cells.push(new ChapterCell(title));
        }
    }
    closeTheProseCell();
    return cells;
}
