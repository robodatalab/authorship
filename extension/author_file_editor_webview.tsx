import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type { AuthorDocumentHostChannel } from "./author_editor/author_document_host_channel";
import { authorFileEditorCellRenderers } from "./author_file_editor_cell_renderers";
import { authorFileEditorCommands } from "./author_file_editor_commands";
import { authorFileEditorCellInsertCommands } from "./author_file_editor_insertable_cell_labels";
import { AuthorDocument } from "./storydoc/model";

declare function acquireVsCodeApi(): AuthorDocumentHostChannel;

function main(): void {
    const hostChannel = acquireVsCodeApi();
    const root = createRoot(
        document.getElementById("author-file-editor-root")!,
    );
    let authorDocument = AuthorDocument.fromText("");

    function draw(): void {
        root.render(
            <AuthorFileEditorCanvas
                document={authorDocument}
                cellRenderers={authorFileEditorCellRenderers(authorDocument)}
                mainMenuCommands={authorFileEditorCommands(hostChannel)}
                cellInsertCommands={authorFileEditorCellInsertCommands(
                    hostChannel,
                )}
            />,
        );
    }

    function open(text: string): void {
        authorDocument = AuthorDocument.fromText(text);
        authorDocument.onChanged(draw);
        draw();
    }

    window.addEventListener("message", (event: MessageEvent) => {
        if (event.data?.type === "document") {
            open(event.data.text as string);
        }
    });

    window.addEventListener("keydown", (event: KeyboardEvent) => {
        if (!event.ctrlKey && !event.metaKey) {
            return;
        }
        if (event.key === "s") {
            event.preventDefault();
            hostChannel.postMessage({
                type: "save",
                text: authorDocument.toText(),
            });
        } else if (event.key === "z" && !event.shiftKey) {
            event.preventDefault();
            authorDocument.undo();
        } else if (event.key === "y" || (event.key === "z" && event.shiftKey)) {
            event.preventDefault();
            authorDocument.redo();
        }
    });

    authorDocument.onChanged(draw);
    draw();
    hostChannel.postMessage({ type: "ready" });
}

main();
