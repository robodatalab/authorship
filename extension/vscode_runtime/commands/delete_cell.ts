import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import { labelOfCellKind } from "../storydoc/cell_kinds";
import type { ImmutableAuthorDocument, ImmutableCell } from "../storydoc/model";
import {
    cellsBySection,
    cellsWithinASection,
    removeTheSection,
    whereACellStands,
    type CellsInASection,
} from "../storydoc/sections";
import type { AuthorDocumentCommand } from "./author_document_command";

const EVERYTHING_UNDER_IT = "Delete All";
const THE_CELL_ALONE = "Only This One";

function nameOf(cell: ImmutableCell): string {
    return cell.attrs.title || labelOfCellKind(cell.kind);
}

async function theAuthorWantsTheWholeSectionGone(
    section: CellsInASection<ImmutableCell>,
): Promise<boolean | undefined> {
    const held = cellsWithinASection(section).length - 1;
    const answer = await vscode.window.showWarningMessage(
        `Delete “${nameOf(section.cell)}” and the ${held} ${held === 1 ? "section" : "sections"} under it?`,
        {
            modal: true,
            detail: "Delete it alone and they stay where they are.",
        },
        EVERYTHING_UNDER_IT,
        THE_CELL_ALONE,
    );
    return answer === undefined ? undefined : answer === EVERYTHING_UNDER_IT;
}

export class DeleteCellCommand implements AuthorDocumentCommand {
    readonly commandName = "deleteCell";
    readonly buttonGroup = "cell";
    readonly iconClassName = "codicon codicon-trash";
    readonly tooltip = "Delete this section";

    async invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const cellId = commandArguments.cellId as string;
        const standing = whereACellStands(
            cellsBySection(session.document.cells),
            cellId,
        );
        if (!standing) {
            return;
        }

        if (standing.section.within.length === 0) {
            session?.changeTheDocument((story) => story.removeCell(cellId));
            return;
        }
        const withEverythingUnderIt = await theAuthorWantsTheWholeSectionGone(
            standing.section,
        );
        if (withEverythingUnderIt === undefined) {
            return;
        }
        if (withEverythingUnderIt) {
            session?.changeTheDocument((story) =>
                removeTheSection(story, cellId),
            );
            return;
        }
        session?.changeTheDocument((story) => story.removeCell(cellId));
    }
}
