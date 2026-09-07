import type { ReactNode } from "react";

import type {
    AuthorDocumentCellRenderers,
    SendMessagesToVscode,
    WebviewCell,
} from "../../webview/author_editor/AuthorFileEditorCanvas";

export interface AuthorDocumentCellType {
    cellKind: string;
    menuLabel: string;
    insertMenuGroup: string;
    render(
        cell: WebviewCell,
        cellIndex: number,
        sendMessagesToVscode: SendMessagesToVscode,
    ): ReactNode;
    newCell(): WebviewCell;
}

const registeredCellTypes = new Map<string, AuthorDocumentCellType>();

export function registerAuthorDocumentCellType(
    cellType: AuthorDocumentCellType,
): void {
    registeredCellTypes.set(cellType.cellKind, cellType);
}

export function authorDocumentCellTypes(): AuthorDocumentCellType[] {
    return [...registeredCellTypes.values()];
}

export function authorDocumentCellRenderers(): AuthorDocumentCellRenderers {
    const renderers: AuthorDocumentCellRenderers = {};
    for (const cellType of registeredCellTypes.values()) {
        renderers[cellType.cellKind] = cellType.render;
    }
    return renderers;
}
