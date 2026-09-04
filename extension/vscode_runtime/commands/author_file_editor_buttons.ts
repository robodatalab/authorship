import type { WebviewAuthorDocumentCommandCard } from "./author_document_command";
import {
    authorDocumentCellTypes,
    type AuthorDocumentCellType,
} from "./author_document_cell_types";
import { authorDocumentCommandsToDraw } from "./author_document_commands";

const AUTHOR_DOCUMENT_CELL_COMMAND_CATEGORY = "cell";

/** How the page speaks to the host: `acquireVsCodeApi().postMessage`. */
export type PostToHost = (message: unknown) => void;

function asking(
    postToHost: PostToHost,
    command: string,
    payload: Record<string, unknown>,
): () => void {
    return () => postToHost({ type: "invoke", command, payload });
}

export function authorDocumentCellCommands(
    postToHost: PostToHost,
    at: number,
): WebviewAuthorDocumentCommandCard[] {
    return authorDocumentCommandsToDraw()
        .filter(
            (card) => card.category === AUTHOR_DOCUMENT_CELL_COMMAND_CATEGORY,
        )
        .map((card) => ({
            name: card.name,
            category: card.category,
            iconClassName: card.iconClassName,
            tooltip: card.tooltip,
            invoke: asking(postToHost, card.name, { at }),
        }));
}

export function authorDocumentCellInsertCommands(
    postToHost: PostToHost,
    at: number,
): WebviewAuthorDocumentCommandCard[] {
    return authorDocumentCellTypes().map((cellType: AuthorDocumentCellType) => ({
        name: "insertCell",
        category: cellType.category,
        iconClassName: "codicon codicon-add",
        tooltip: cellType.label,
        invoke: asking(postToHost, "insertCell", {
            at,
            cell: cellType.create(),
        }),
    }));
}

export function replaceCellMarkdown(
    postToHost: PostToHost,
    at: number,
    markdown: string,
): void {
    asking(postToHost, "replaceMarkdown", { at, markdown })();
}

export function replaceCellAttribute(
    postToHost: PostToHost,
    at: number,
    name: string,
    value: string,
): void {
    asking(postToHost, "replaceAttribute", { at, name, value })();
}

function hostCommand(
    postToHost: PostToHost,
    category: string,
    iconClassName: string,
    tooltip: string,
    hostMessageType: string,
): WebviewAuthorDocumentCommandCard {
    return {
        name: hostMessageType,
        category,
        iconClassName,
        tooltip,
        invoke: () => postToHost({ type: hostMessageType }),
    };
}

export function authorFileEditorCommands(
    postToHost: PostToHost,
): WebviewAuthorDocumentCommandCard[] {
    return [
        hostCommand(
            postToHost,
            "manuscript",
            "codicon codicon-run-all",
            "Run All — build every section that is built rather than written",
            "compile",
        ),
        hostCommand(
            postToHost,
            "manuscript",
            "codicon codicon-checklist",
            "Check Prose — underline grammar and repetition while you write",
            "checkToggle",
        ),
        hostCommand(
            postToHost,
            "manuscript",
            "codicon codicon-sparkle",
            "Fix Style & Grammar — read the whole manuscript with Gemini and correct it, a chapter at a time",
            "fixStyle",
        ),
        {
            name: "importMarkdown",
            category: "transfer",
            iconClassName: "aicon aicon-import-markdown",
            tooltip:
                "Import Markdown — replace this document with an existing markdown manuscript",
            invoke: () =>
                postToHost({
                    type: "command",
                    command: "authorship.importMarkdown",
                }),
        },
        {
            name: "exportMarkdown",
            category: "transfer",
            iconClassName: "aicon aicon-export-markdown",
            tooltip:
                "Export Markdown — write this document out as one plain markdown manuscript",
            invoke: () =>
                postToHost({
                    type: "command",
                    command: "authorship.exportMarkdown",
                }),
        },
        hostCommand(
            postToHost,
            "transfer",
            "aicon aicon-export-epub",
            "Export EPUB — build the book beside this document",
            "exportEpub",
        ),
        hostCommand(
            postToHost,
            "transfer",
            "aicon aicon-export-parts",
            "Divide into Parts — cut the story into part_1.author, part_2.author… beside it",
            "partition",
        ),
        hostCommand(
            postToHost,
            "view",
            "codicon codicon-file-code",
            "View Source — open the same file as plain text",
            "openAsText",
        ),
    ];
}
