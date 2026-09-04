import type { ReactNode } from "react";

import { AuthorDocumentCommand } from "./author_editor/author_document_command";
import type { AuthorDocumentHostChannel } from "./author_editor/author_document_host_channel";
import type { AuthorDocumentCellRenderers } from "./author_editor/AuthorFileEditorCanvas";
import type { AuthorDocument, Cell } from "./storydoc/model";

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


export function authorDocumentCellCommands(
    authorDocument: AuthorDocument,
    at: number,
): AuthorDocumentCommand[] {
    const cell = authorDocument.cells[at];
    return [
        {
            category: "cell",
            iconClassName: cell.isFolded()
                ? "codicon codicon-fold-down"
                : "codicon codicon-fold-up",
            tooltip: cell.isFolded()
                ? "Unfold this section"
                : "Fold this section away",
            invoke: () => cell.fold(!cell.isFolded()),
        },
        {
            category: "cell",
            iconClassName: "codicon codicon-chevron-up",
            tooltip: "Move up",
            invoke: () => authorDocument.moveAt(at, at - 1),
        },
        {
            category: "cell",
            iconClassName: "codicon codicon-chevron-down",
            tooltip: "Move down",
            invoke: () => authorDocument.moveAt(at, at + 1),
        },
        {
            category: "cell",
            iconClassName: "codicon codicon-trash",
            tooltip: "Delete this section",
            invoke: () => authorDocument.removeAt(at),
        },
    ];
}

function hostCommand(
    hostChannel: AuthorDocumentHostChannel,
    category: string,
    iconClassName: string,
    tooltip: string,
    hostMessageType: string,
): AuthorDocumentCommand {
    return {
        category,
        iconClassName,
        tooltip,
        invoke: () => hostChannel.postMessage({ type: hostMessageType }),
    };
}

export function authorFileEditorCommands(
    hostChannel: AuthorDocumentHostChannel,
): AuthorDocumentCommand[] {
    return [
        hostCommand(
            hostChannel,
            "manuscript",
            "codicon codicon-run-all",
            "Run All — build every section that is built rather than written",
            "compile",
        ),
        hostCommand(
            hostChannel,
            "manuscript",
            "codicon codicon-checklist",
            "Check Prose — underline grammar and repetition while you write",
            "checkToggle",
        ),
        hostCommand(
            hostChannel,
            "manuscript",
            "codicon codicon-sparkle",
            "Fix Style & Grammar — read the whole manuscript with Gemini and correct it, a chapter at a time",
            "fixStyle",
        ),
        hostCommand(
            hostChannel,
            "transfer",
            "aicon aicon-import-markdown",
            "Import Markdown — replace this document with an existing markdown manuscript",
            "importMarkdown",
        ),
        hostCommand(
            hostChannel,
            "transfer",
            "aicon aicon-export-markdown",
            "Export Markdown — write this document out as one plain markdown manuscript",
            "exportMarkdown",
        ),
        hostCommand(
            hostChannel,
            "transfer",
            "aicon aicon-export-epub",
            "Export EPUB — build the book beside this document",
            "exportEpub",
        ),
        hostCommand(
            hostChannel,
            "transfer",
            "aicon aicon-export-parts",
            "Divide into Parts — cut the story into part_1.author, part_2.author… beside it",
            "partition",
        ),
        hostCommand(
            hostChannel,
            "view",
            "codicon codicon-file-code",
            "View Source — open the same file as plain text",
            "openAsText",
        ),
    ];
}
