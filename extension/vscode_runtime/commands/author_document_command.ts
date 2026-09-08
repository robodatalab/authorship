import type { AuthorDocument } from "../storydoc/model";

export interface CellAttributeCondition {
    readonly attributeName: string;
    readonly attributeValue: string;
}

export interface AuthorDocumentCommand {
    readonly commandName: string;
    readonly buttonGroup: string;
    readonly iconClassName: string;
    readonly tooltip: string;
    readonly drawnWhenCellAttributeIs?: CellAttributeCondition;
    readonly runsCellsOfKind?: string;
    invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): void | Promise<void>;
}
