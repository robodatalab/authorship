import type { AuthorDocumentCommand } from "./author_document_command";
import type { AuthorDocument } from "../storydoc/model";

export class RunAllCommand implements AuthorDocumentCommand {
    readonly commandName = "runAll";
    readonly buttonGroup = "all_cells";
    readonly iconClassName = "codicon codicon-run-all";
    readonly tooltip = "Run All — write every section that writes itself";

    constructor(
        private readonly commandThatRunsCellsOfKind: (
            cellKind: string,
        ) => AuthorDocumentCommand | undefined,
    ) {}

    async invoke(document: AuthorDocument): Promise<void> {
        const queued: { cellId: string; command: AuthorDocumentCommand }[] = [];
        for (const cell of document.cells) {
            const command = this.commandThatRunsCellsOfKind(cell.kind);
            if (command) {
                queued.push({ cellId: cell.uniqueId, command });
            }
        }
        for (const { cellId, command } of queued) {
            if (document.cellWithId(cellId)) {
                await command.invoke(document, { cellId });
            }
        }
    }
}
