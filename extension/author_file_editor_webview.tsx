import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type { AuthorDocumentHostChannel } from "./author_editor/author_document_host_channel";
import { authorFileEditorCommands } from "./author_file_editor_commands";
import { authorFileEditorCellInsertCommands } from "./author_file_editor_insertable_cell_labels";
import type { Cell } from "./storydoc/model";

declare function acquireVsCodeApi(): AuthorDocumentHostChannel;

let loadedCells: Cell[] = [];

function main(): void {
    const hostChannel = acquireVsCodeApi();

    window.addEventListener("message", (event: MessageEvent) => {
        if (event.data?.type === "cells") {
            loadedCells = event.data.cells as Cell[];
        }
    });

    createRoot(document.getElementById("author-file-editor-root")!).render(
        <AuthorFileEditorCanvas
            mainMenuCommands={authorFileEditorCommands(hostChannel)}
            cellInsertCommands={authorFileEditorCellInsertCommands(hostChannel)}
        />,
    );

    hostChannel.postMessage({ type: "ready" });
}

main();
