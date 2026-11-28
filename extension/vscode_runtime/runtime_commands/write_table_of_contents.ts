import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";
import { type Document } from "authordoc/storydoc";
import type { Cell } from "authordoc/cells/cell";
import { ChapterCell } from "authordoc/cells/chapter_cell";
import { PartCell } from "authordoc/cells/part_cell";
import { TABLE_OF_CONTENTS } from "authordoc/cells/table_of_contents_cell";
import {
    cellsBySection,
    type CellsInASection,
} from "authordoc/story_sections";

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

export const WRITE_TABLE_OF_CONTENTS = "writeTableOfContents";

export class WriteTableOfContentsCommand implements RuntimeCommand {
    constructor(private readonly cellId: string) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): WriteTableOfContentsCommand {
        const cellId = serialized.cellId as string;
        const command = new WriteTableOfContentsCommand(cellId);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        const tableOfContents = tableOfContentsOf(session.document);
        session.changeTheDocument((story) => {
            const cell = story.cellWithId(this.cellId);
            if (!cell) {
                return story;
            }
            const cellRewritten = cell.withSource(tableOfContents);
            const storyChanged = story.withCell(cellRewritten);
            return storyChanged;
        });
    }
}
