import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { divideManuscript } from "../../graveyard/parts/divide";
import type { AuthorDocument } from "../storydoc/model";

export class DivideIntoPartsCommand implements AuthorDocumentCommand {
    readonly commandName = "divideIntoParts";
    readonly buttonGroup = "transfer";
    readonly iconClassName = "aicon aicon-export-parts";
    readonly tooltip =
        "Divide into Parts — cut the story into part_1.author, part_2.author… beside it";

    async invoke(document: AuthorDocument): Promise<void> {
        const { folder, parts } = await divideManuscript(
            document.uri,
            document.cells,
        );
        void vscode.window.showInformationMessage(
            parts === 0
                ? `Nothing to divide — add a Part where ${vscode.workspace.asRelativePath(document.uri)} should break.`
                : `Wrote ${parts} ${parts === 1 ? "part" : "parts"} to ${vscode.workspace.asRelativePath(folder)}`,
        );
    }
}
