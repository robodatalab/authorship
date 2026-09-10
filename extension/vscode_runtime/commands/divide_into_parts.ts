import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { divideManuscript } from "../parts/divide_manuscript";
import type { ImmutableAuthorDocument } from "../storydoc/model";

export class DivideIntoPartsCommand implements AuthorDocumentCommand {
    readonly commandName = "divideIntoParts";
    readonly buttonGroup = "transfer";
    readonly iconClassName = "aicon aicon-export-parts";
    readonly tooltip =
        "Divide into Parts — cut the story into part_1.author, part_2.author… beside it";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const dividedManuscript = await divideManuscript(
            session.document.uri,
            session.document.cells,
        );
        void vscode.window.showInformationMessage(
            dividedManuscript.partFilesWritten === 0
                ? `Nothing to divide — add a Part where ${vscode.workspace.asRelativePath(session.document.uri)} should break.`
                : `Wrote ${dividedManuscript.partFilesWritten} ${dividedManuscript.partFilesWritten === 1 ? "part" : "parts"} to ${vscode.workspace.asRelativePath(dividedManuscript.partsFolder)}`,
        );
    }
}
