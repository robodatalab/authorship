import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type { AuthorDocumentHostChannel } from "./author_editor/author_document_host_channel";
import {
    authorDocumentCellInsertCommands,
    authorDocumentCellRenderers,
    authorFileEditorCommands,
} from "./author_file_editor_commands";
import { AuthorDocument } from "./storydoc/model";

declare function acquireVsCodeApi(): AuthorDocumentHostChannel;

declare const require: {
    context(
        directory: string,
        useSubdirectories: boolean,
        expression: RegExp,
    ): { keys(): string[]; (id: string): unknown };
};

try {
    const cellTypeModules = require.context("./cell_types", false, /\.tsx$/);
    cellTypeModules.keys().forEach(cellTypeModules);
} catch {
    void 0;
}

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
                cellRenderers={authorDocumentCellRenderers()}
                mainMenuCommands={authorFileEditorCommands(hostChannel)}
                cellInsertCommandsAt={(at) =>
                    authorDocumentCellInsertCommands(authorDocument, at)
                }
            />,
        );
    }

    function open(text: string): void {
        authorDocument = AuthorDocument.fromText(text);
        authorDocument.onChanged(() => {
            hostChannel.postMessage({
                type: "edit",
                text: authorDocument.toText(),
            });
            draw();
        });
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
                type: "command",
                command: "workbench.action.files.save",
            });
        } else if (event.key === "z" && !event.shiftKey) {
            event.preventDefault();
            hostChannel.postMessage({ type: "command", command: "undo" });
        } else if (event.key === "y" || (event.key === "z" && event.shiftKey)) {
            event.preventDefault();
            hostChannel.postMessage({ type: "command", command: "redo" });
        }
    });

    draw();
    hostChannel.postMessage({ type: "ready" });
}

main();
