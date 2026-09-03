import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type { AuthorDocumentHostChannel } from "./author_editor/author_document_host_channel";
import { AUTHOR_FILE_EDITOR_CELL_RENDERERS } from "./author_file_editor_cell_renderers";
import { authorFileEditorCommands } from "./author_file_editor_commands";
import { authorFileEditorCellInsertCommands } from "./author_file_editor_insertable_cell_labels";
import type { Cell } from "./storydoc/model";

declare function acquireVsCodeApi(): AuthorDocumentHostChannel;

function main(): void {
    const hostChannel = acquireVsCodeApi();
    const root = createRoot(
        document.getElementById("author-file-editor-root")!,
    );

    function draw(cells: Cell[]): void {
        root.render(
            <AuthorFileEditorCanvas
                cells={cells}
                cellRenderers={AUTHOR_FILE_EDITOR_CELL_RENDERERS}
                mainMenuCommands={authorFileEditorCommands(hostChannel)}
                cellInsertCommands={authorFileEditorCellInsertCommands(
                    hostChannel,
                )}
            />,
        );
    }

    window.addEventListener("message", (event: MessageEvent) => {
        if (event.data?.type === "cells") {
            draw(event.data.cells as Cell[]);
        }
    });

    draw([]);
    hostChannel.postMessage({ type: "ready" });
}

main();
