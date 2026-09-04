import type { ReactNode } from "react";

import type {
    AuthorDocumentCellRenderers,
    WebviewCell,
} from "../../webview/author_editor/AuthorFileEditorCanvas";
import type { PostToHost } from "./author_file_editor_buttons";

export interface AuthorDocumentCellType {
    kind: string;
    label: string;
    category: string;
    render(cell: WebviewCell, at: number, postToHost: PostToHost): ReactNode;
    create(): WebviewCell;
}

const registeredCellTypes = new Map<string, AuthorDocumentCellType>();

export function registerAuthorDocumentCellType(
    cellType: AuthorDocumentCellType,
): void {
    registeredCellTypes.set(cellType.kind, cellType);
}

export function authorDocumentCellTypes(): AuthorDocumentCellType[] {
    return [...registeredCellTypes.values()];
}

export function authorDocumentCellRenderers(): AuthorDocumentCellRenderers {
    const renderers: AuthorDocumentCellRenderers = {};
    for (const cellType of registeredCellTypes.values()) {
        renderers[cellType.kind] = cellType.render;
    }
    return renderers;
}
