import type { WebviewAuthorDocumentCommandCard } from "./AuthorFileEditorCanvas";

export const AUTHOR_FILE_EDITOR_COMMAND_CARDS: WebviewAuthorDocumentCommandCard[] =
    [
        {
            commandName: "runAll",
            buttonGroup: "all_cells",
            iconClassName: "codicon codicon-run-all",
            tooltip: "Run All — write every section that writes itself",
        },
        {
            commandName: "foldAll",
            buttonGroup: "all_cells",
            iconClassName: "codicon codicon-collapse-all",
            tooltip: "Fold every section away",
            drawnWhenTheCellIsFolded: false,
        },
        {
            commandName: "unfoldAll",
            buttonGroup: "all_cells",
            iconClassName: "codicon codicon-expand-all",
            tooltip: "Unfold every section",
            drawnWhenTheCellIsFolded: true,
        },
        {
            commandName: "foldCell",
            buttonGroup: "cell",
            iconClassName: "codicon codicon-collapse-all",
            tooltip: "Fold this section away",
            drawnWhenTheCellIsFolded: false,
        },
        {
            commandName: "unfoldCell",
            buttonGroup: "cell",
            iconClassName: "codicon codicon-expand-all",
            tooltip: "Unfold this section",
            drawnWhenTheCellIsFolded: true,
        },
        {
            commandName: "deleteCell",
            buttonGroup: "cell",
            iconClassName: "codicon codicon-trash",
            tooltip: "Delete this section",
        },
        {
            commandName: "insertCell",
            buttonGroup: "insert",
            iconClassName: "codicon codicon-add",
            tooltip: "Add a section here",
        },
        {
            commandName: "importMarkdown",
            buttonGroup: "transfer",
            iconClassName: "aicon aicon-import-markdown",
            tooltip:
                "Import Markdown — replace this document with an existing markdown manuscript",
        },
        {
            commandName: "exportMarkdown",
            buttonGroup: "transfer",
            iconClassName: "aicon aicon-export-markdown",
            tooltip:
                "Export Markdown — write this document out as one plain markdown manuscript",
        },
        {
            commandName: "exportEpub",
            buttonGroup: "transfer",
            iconClassName: "aicon aicon-export-epub",
            tooltip: "Export EPUB — build the book beside this document",
        },
        {
            commandName: "divideIntoParts",
            buttonGroup: "transfer",
            iconClassName: "aicon aicon-export-parts",
            tooltip:
                "Divide into Parts — cut the story into part_1.author, part_2.author… beside it",
        },
        {
            commandName: "checkProse",
            buttonGroup: "check",
            iconClassName: "codicon codicon-checklist",
            tooltip:
                "Check Prose — read the whole document for faults of usage and style",
        },
        {
            commandName: "fixStyle",
            buttonGroup: "check",
            iconClassName: "codicon codicon-sparkle",
            tooltip:
                "Fix Style and Grammar — send every section to be copy-edited",
        },
        {
            commandName: "openAsText",
            buttonGroup: "view",
            iconClassName: "codicon codicon-file-code",
            tooltip: "View Source — open the same file as plain text",
        },
        {
            commandName: "writeBlurb",
            buttonGroup: "run",
            iconClassName: "",
            tooltip: "",
            runsCellsOfKind: "blurb",
        },
        {
            commandName: "writeStorySoFar",
            buttonGroup: "run",
            iconClassName: "",
            tooltip: "",
            runsCellsOfKind: "recap",
        },
        {
            commandName: "writeTableOfContents",
            buttonGroup: "run",
            iconClassName: "",
            tooltip: "",
            runsCellsOfKind: "contents",
        },
        {
            commandName: "generateStory",
            buttonGroup: "generate",
            iconClassName: "codicon codicon-wand",
            tooltip: "Generate the story with you, stage by stage",
        },
    ];
