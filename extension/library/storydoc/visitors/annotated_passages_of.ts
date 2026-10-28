import type { AboutCell } from "../cells/about_cell";
import type { BlurbCell } from "../cells/blurb_cell";
import type { CellVisitor } from "../cells/cell_visitor";
import type { ChapterCell } from "../cells/chapter_cell";
import type { DisclaimerCell } from "../cells/disclaimer_cell";
import type { DividerCell } from "../cells/divider_cell";
import type { ImageCell } from "../cells/image_cell";
import type { MarkdownCell } from "../cells/markdown_cell";
import type { NoteCell } from "../cells/note_cell";
import type { PartCell } from "../cells/part_cell";
import type { PlotCell } from "../cells/plot_cell";
import type { RecapCell } from "../cells/recap_cell";
import type { SalientConceptCell } from "../cells/salient_concept_cell";
import type { StoryWordRange } from "../cells/story_word_range";
import type { TableOfContentsCell } from "../cells/table_of_contents_cell";
import type { TitlePageCell } from "../cells/title_page_cell";
import type { UnknownCell } from "../cells/unknown_cell";

export class AnnotatedPassage {
    constructor(
        readonly passageId: string,
        readonly storyWordRange: StoryWordRange,
    ) {}
}

export class AnnotatedPassages {
    constructor(
        readonly title: string,
        readonly description: string,
        readonly passages: readonly AnnotatedPassage[],
    ) {}
}

export class AnnotatedPassagesOf implements CellVisitor<AnnotatedPassages | null> {
    visitSalientConcept(cell: SalientConceptCell): AnnotatedPassages {
        const passages = cell.references.map(
            (reference) =>
                new AnnotatedPassage(
                    reference.referenceId,
                    reference.storyWordRange,
                ),
        );
        return new AnnotatedPassages(cell.title, cell.source, passages);
    }

    // Only an event that story text tells has a passage.
    visitPlot(cell: PlotCell): AnnotatedPassages {
        const passages = cell.nodes.flatMap((node) =>
            node.storyWordRange === null
                ? []
                : [new AnnotatedPassage(node.nodeId, node.storyWordRange)],
        );
        return new AnnotatedPassages(cell.title, cell.overview, passages);
    }

    visitMarkdown(_cell: MarkdownCell): null {
        return null;
    }

    visitChapter(_cell: ChapterCell): null {
        return null;
    }

    visitPart(_cell: PartCell): null {
        return null;
    }

    visitDivider(_cell: DividerCell): null {
        return null;
    }

    visitTitlePage(_cell: TitlePageCell): null {
        return null;
    }

    visitImage(_cell: ImageCell): null {
        return null;
    }

    visitTableOfContents(_cell: TableOfContentsCell): null {
        return null;
    }

    visitDisclaimer(_cell: DisclaimerCell): null {
        return null;
    }

    visitAbout(_cell: AboutCell): null {
        return null;
    }

    visitBlurb(_cell: BlurbCell): null {
        return null;
    }

    visitNote(_cell: NoteCell): null {
        return null;
    }

    visitRecap(_cell: RecapCell): null {
        return null;
    }

    visitUnknown(_cell: UnknownCell): null {
        return null;
    }
}
