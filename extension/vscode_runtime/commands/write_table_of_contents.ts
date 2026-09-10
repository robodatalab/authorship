import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import { partIsPrintedInTheBook } from "../parts/manuscript_parts";
import {
    CHAPTER,
    CONTENTS,
    PART,
    type ImmutableAuthorDocument,
    type ImmutableCell,
} from "../storydoc/model";
import { cellsBySection, type CellsInASection } from "../storydoc/sections";

const UNTITLED = "Untitled";
const UNDER_THE_PART = "    ";

function contentsOf(document: ImmutableAuthorDocument): string {
    return linesOfTheContents(cellsBySection(document.cells), "").join("\n");
}

function linesOfTheContents(
    sections: CellsInASection<ImmutableCell>[],
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
        return partIsPrintedInTheBook(section.cell)
            ? [
                  listed,
                  ...linesOfTheContents(
                      section.within,
                      `${indent}${UNDER_THE_PART}`,
                  ),
              ]
            : linesOfTheContents(section.within, indent);
    });
}

export class WriteTableOfContentsCommand implements AuthorDocumentCommand {
    readonly commandName = "writeTableOfContents";
    readonly buttonGroup = "run";
    readonly iconClassName = "";
    readonly tooltip = "";
    readonly runsCellsOfKind = CONTENTS;

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) =>
            story
                .cellWithId(commandArguments.cellId as string)
                ?.replaceMarkdown(contentsOf(session.document)),
        );
    }
}
