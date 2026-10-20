import type { ReactNode } from "react";
import type { SendMessagesToVscode } from "./AuthorFileEditorCanvas";
import type { AboutCell } from "../../library/storydoc/cells/about_cell";
import type { BlurbCell } from "../../library/storydoc/cells/blurb_cell";
import type { CellVisitor } from "../../library/storydoc/cells/cell_visitor";
import type { ChapterCell } from "../../library/storydoc/cells/chapter_cell";
import type { DisclaimerCell } from "../../library/storydoc/cells/disclaimer_cell";
import type { DividerCell } from "../../library/storydoc/cells/divider_cell";
import type { ImageCell } from "../../library/storydoc/cells/image_cell";
import type { MarkdownCell } from "../../library/storydoc/cells/markdown_cell";
import type { NoteCell } from "../../library/storydoc/cells/note_cell";
import type { PartCell } from "../../library/storydoc/cells/part_cell";
import type { PlotCell } from "../../library/storydoc/cells/plot_cell";
import type { RecapCell } from "../../library/storydoc/cells/recap_cell";
import type { SalientConceptCell } from "../../library/storydoc/cells/salient_concept_cell";
import type { TableOfContentsCell } from "../../library/storydoc/cells/table_of_contents_cell";
import type { TitlePageCell } from "../../library/storydoc/cells/title_page_cell";
import type { UnknownCell } from "../../library/storydoc/cells/unknown_cell";
import { AuthorFileEditorAboutCell } from "../cell_types/AuthorFileEditorAboutCell";
import { AuthorFileEditorBlurbCell } from "../cell_types/AuthorFileEditorBlurbCell";
import { AuthorFileEditorChapterCell } from "../cell_types/AuthorFileEditorChapterCell";
import { AuthorFileEditorDisclaimerCell } from "../cell_types/AuthorFileEditorDisclaimerCell";
import { AuthorFileEditorDividerCell } from "../cell_types/AuthorFileEditorDividerCell";
import { AuthorFileEditorImageCell } from "../cell_types/AuthorFileEditorImageCell";
import { AuthorFileEditorMarkdownCell } from "../cell_types/AuthorFileEditorMarkdownCell";
import { AuthorFileEditorNoteCell } from "../cell_types/AuthorFileEditorNoteCell";
import { AuthorFileEditorPartCell } from "../cell_types/AuthorFileEditorPartCell";
import { AuthorFileEditorRecapCell } from "../cell_types/AuthorFileEditorRecapCell";
import { AuthorFileEditorTableOfContentsCell } from "../cell_types/AuthorFileEditorTableOfContentsCell";
import { AuthorFileEditorTitlePageCell } from "../cell_types/AuthorFileEditorTitlePageCell";

export class AuthorFileEditorCellRenderer implements CellVisitor<ReactNode> {
    constructor(private readonly sendMessagesToVscode: SendMessagesToVscode) {}

    visitMarkdown(cell: MarkdownCell): ReactNode {
        return (
            <AuthorFileEditorMarkdownCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitChapter(cell: ChapterCell): ReactNode {
        return (
            <AuthorFileEditorChapterCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitPart(cell: PartCell): ReactNode {
        return (
            <AuthorFileEditorPartCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitDivider(_cell: DividerCell): ReactNode {
        return <AuthorFileEditorDividerCell />;
    }

    visitTitlePage(cell: TitlePageCell): ReactNode {
        return (
            <AuthorFileEditorTitlePageCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitImage(cell: ImageCell): ReactNode {
        return (
            <AuthorFileEditorImageCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitTableOfContents(cell: TableOfContentsCell): ReactNode {
        return (
            <AuthorFileEditorTableOfContentsCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitDisclaimer(cell: DisclaimerCell): ReactNode {
        return (
            <AuthorFileEditorDisclaimerCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitAbout(cell: AboutCell): ReactNode {
        return (
            <AuthorFileEditorAboutCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitBlurb(cell: BlurbCell): ReactNode {
        return (
            <AuthorFileEditorBlurbCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitNote(cell: NoteCell): ReactNode {
        return (
            <AuthorFileEditorNoteCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitRecap(cell: RecapCell): ReactNode {
        return (
            <AuthorFileEditorRecapCell
                cell={cell}
                sendMessagesToVscode={this.sendMessagesToVscode}
            />
        );
    }

    visitSalientConcept(_cell: SalientConceptCell): ReactNode {
        return null;
    }

    visitPlot(_cell: PlotCell): ReactNode {
        return null;
    }

    visitUnknown(_cell: UnknownCell): ReactNode {
        return null;
    }
}
