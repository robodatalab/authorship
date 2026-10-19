import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import { type Document } from "../storydoc/storydoc";
import type { Cell } from "../storydoc/cells/cell";
import { ChapterCell } from "../storydoc/cells/chapter_cell";
import { PartCell } from "../storydoc/cells/part_cell";
import { TABLE_OF_CONTENTS } from "../storydoc/cells/table_of_contents_cell";
import {
    cellsBySection,
    type CellsInASection,
} from "../storydoc/story_sections";

const UNTITLED = "Untitled";
const UNDER_THE_PART = "    ";

function tableOfContentsOf(document: Document): string {
    return linesOfTheContents(cellsBySection(document.cells), "").join("\n");
}

function linesOfTheContents(
    sections: CellsInASection<Cell>[],
    indent: string,
): string[] {
    return sections.flatMap((section) => {
        if (section.cell instanceof ChapterCell) {
            return [`${indent}1. ${section.cell.title || UNTITLED}`];
        }
        if (!(section.cell instanceof PartCell)) {
            return [];
        }
        const listed = `${indent}1. ${section.cell.title || UNTITLED}`;
        const listedWithin = linesOfTheContents(
            section.within,
            `${indent}${UNDER_THE_PART}`,
        );
        return [listed, ...listedWithin];
    });
}

export class WriteTableOfContentsCommand implements AuthorDocumentCommand {
    readonly commandName = "writeTableOfContents";
    readonly buttonGroup = "run";
    readonly iconClassName = "";
    readonly tooltip = "";
    readonly runsCellsOfKind = TABLE_OF_CONTENTS;

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const cellId = commandArguments.cellId as string;
        const tableOfContents = tableOfContentsOf(session.document);
        session.changeTheDocument((story) => {
            const cellIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === cellId,
            );
            if (cellIndex === -1) {
                return;
            }
            const cell = story.cells[cellIndex];
            story.cells[cellIndex] = cell.withSource(tableOfContents);
        });
    }
}
