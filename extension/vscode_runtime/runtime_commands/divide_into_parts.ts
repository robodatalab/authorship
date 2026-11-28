import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { RuntimeCommand } from "./runtime_command";
import { divideManuscript } from "../parts/divide_manuscript";

export const DIVIDE_INTO_PARTS = "divideIntoParts";

export class DivideIntoPartsCommand implements RuntimeCommand {
    static deserialize(): DivideIntoPartsCommand {
        const command = new DivideIntoPartsCommand();
        return command;
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const dividedManuscript = await divideManuscript(
            session.uri,
            session.document.cells,
        );
        void vscode.window.showInformationMessage(
            dividedManuscript.partFilesWritten === 0
                ? `Nothing to divide — add a Divider where ${vscode.workspace.asRelativePath(session.uri)} should break.`
                : `Wrote ${dividedManuscript.partFilesWritten} ${dividedManuscript.partFilesWritten === 1 ? "part" : "parts"} to ${vscode.workspace.asRelativePath(dividedManuscript.partsFolder)}`,
        );
    }
}
