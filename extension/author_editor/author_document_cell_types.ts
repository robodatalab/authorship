import type { ReactNode } from "react";
import type { AuthorDocument, Cell } from "../storydoc/model";
import type { AuthorDocumentCellRenderers } from "./author_document_cell_renderers";
import type { AuthorDocumentCommand } from "./author_document_command";
import type { AuthorDocumentHostChannel } from "./author_document_host_channel";

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
    private readonly hostChannel: AuthorDocumentHostChannel;
    private readonly cellType: AuthorDocumentCellType;

    constructor(
        hostChannel: AuthorDocumentHostChannel,
        cellType: AuthorDocumentCellType,
    ) {
        this.hostChannel = hostChannel;
        this.cellType = cellType;
        this.tooltip = cellType.label;
        this.category = cellType.category;
    }

    invoke = () => {
        // TODO: do stuff to modify the document and insert the cell in a proper place
    };
}

export function authorDocumentCellInsertCommands(
    hostChannel: AuthorDocumentHostChannel,
): AuthorDocumentCommand[] {
    return [...registeredCellTypes.values()].map(
        (cellType) => new CellInsertCommand(hostChannel, cellType),
    );
}
