import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import {
    CHAPTER,
    PART,
    TABLE_OF_CONTENTS,
    type Cell,
    type Document,
} from "../storydoc/storydoc";
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
        const listed = `${indent}1. ${section.cell.attrs.title || UNTITLED}`;
        if (section.cell.kind === CHAPTER) {
            return [listed];
        }
        if (section.cell.kind !== PART) {
            return [];
        }
        return [
            listed,
            ...linesOfTheContents(section.within, `${indent}${UNDER_THE_PART}`),
        ];
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
