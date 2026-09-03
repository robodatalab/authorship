import { AuthorDocumentCommand } from "./author_editor/author_document_command";

interface VsCodeApi {
    postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

function hostCommand(
    category: string,
    iconClassName: string,
    tooltip: string,
    hostMessageType: string,
): AuthorDocumentCommand {
    return {
        category,
        iconClassName,
        tooltip,
        invoke: () => vscodeApi.postMessage({ type: hostMessageType }),
    };
}

export const AUTHOR_FILE_EDITOR_COMMANDS: AuthorDocumentCommand[] = [
    hostCommand(
        "manuscript",
        "codicon codicon-run-all",
        "Run All — build every section that is built rather than written",
        "compile",
    ),
    hostCommand(
        "manuscript",
        "codicon codicon-checklist",
        "Check Prose — underline grammar and repetition while you write",
        "checkToggle",
    ),
    hostCommand(
        "manuscript",
        "codicon codicon-sparkle",
        "Fix Style & Grammar — read the whole manuscript with Gemini and correct it, a chapter at a time",
        "fixStyle",
    ),
    hostCommand(
        "transfer",
        "aicon aicon-import-markdown",
        "Import Markdown — replace this document with an existing markdown manuscript",
        "importMarkdown",
    ),
    hostCommand(
        "transfer",
        "aicon aicon-export-markdown",
        "Export Markdown — write this document out as one plain markdown manuscript",
        "exportMarkdown",
    ),
    hostCommand(
        "transfer",
        "aicon aicon-export-epub",
        "Export EPUB — build the book beside this document",
        "exportEpub",
    ),
    hostCommand(
        "transfer",
        "aicon aicon-export-parts",
        "Divide into Parts — cut the story into part_1.author, part_2.author… beside it",
        "partition",
    ),
    hostCommand(
        "view",
        "codicon codicon-file-code",
        "View Source — open the same file as plain text",
        "openAsText",
    ),
];
