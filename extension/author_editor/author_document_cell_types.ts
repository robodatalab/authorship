import type { ReactNode } from "react";
import type { AuthorDocument, Cell } from "../storydoc/model";
import type { AuthorDocumentCellRenderers } from "./author_document_cell_renderers";
import type { AuthorDocumentCommand } from "./author_document_command";

export interface AuthorDocumentCellType {
    kind: string;
    label: string;
    category: string;
    render(document: AuthorDocument, cellIndex: number): ReactNode;
    create(): Cell;
}

const registeredCellTypes = new Map<string, AuthorDocumentCellType>();

export function registerAuthorDocumentCellType(
    cellType: AuthorDocumentCellType,
): void {
    registeredCellTypes.set(cellType.kind, cellType);
}

export function authorDocumentCellRenderers(): AuthorDocumentCellRenderers {
    const renderers: AuthorDocumentCellRenderers = {};
    for (const cellType of registeredCellTypes.values()) {
        renderers[cellType.kind] = cellType.render;
    }
    return renderers;
}

class CellInsertCommand implements AuthorDocumentCommand {
    readonly category: string;
    readonly iconClassName = "codicon codicon-add";
    readonly tooltip: string;
    private readonly authorDocument: AuthorDocument;
    private readonly at: number;
    private readonly cellType: AuthorDocumentCellType;

    constructor(
        authorDocument: AuthorDocument,
        at: number,
        cellType: AuthorDocumentCellType,
    ) {
        this.authorDocument = authorDocument;
        this.at = at;
        this.cellType = cellType;
        this.tooltip = cellType.label;
        this.category = cellType.category;
    }

    invoke = () => {
        this.authorDocument.insertAt(this.at, this.cellType.create());
    };
}

export function authorDocumentCellInsertCommands(
    authorDocument: AuthorDocument,
    at: number,
): AuthorDocumentCommand[] {
    return [...registeredCellTypes.values()].map(
        (cellType) => new CellInsertCommand(authorDocument, at, cellType),
    );
}
