import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type { AuthorDocumentHostChannel } from "./author_editor/author_document_host_channel";
import {
    authorDocumentCellCommands,
    authorDocumentCellInsertCommands,
    authorDocumentCellRenderers,
    authorFileEditorCommands,
} from "./author_file_editor_commands";
import { AuthorDocument } from "../vscode_runtime/storydoc/model";

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
                cellCommandsAt={(at) =>
                    authorDocumentCellCommands(authorDocument, at)
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

    draw();
    hostChannel.postMessage({ type: "ready" });
}

main();
