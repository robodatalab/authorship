import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type { WebviewCell } from "./author_editor/AuthorFileEditorCanvas";
import { authorDocumentCellRenderers } from "../vscode_runtime/commands/author_document_cell_types";
import type { PostToHost } from "../vscode_runtime/commands/author_file_editor_buttons";
import {
    authorDocumentCellCommands,
    authorDocumentCellInsertCommands,
    authorFileEditorCommands,
} from "../vscode_runtime/commands/author_file_editor_buttons";

declare function acquireVsCodeApi(): { postMessage: PostToHost };

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
    const postToHost: PostToHost = acquireVsCodeApi().postMessage;
    const root = createRoot(
        document.getElementById("author-file-editor-root")!,
    );
    let cells: WebviewCell[] = [];

    function draw(): void {
        root.render(
            <AuthorFileEditorCanvas
                cells={cells}
                postToHost={postToHost}
                cellRenderers={authorDocumentCellRenderers()}
                mainMenuCommands={authorFileEditorCommands(postToHost)}
                cellInsertCommandsAt={(at) =>
                    authorDocumentCellInsertCommands(postToHost, at)
                }
                cellCommandsAt={(at) =>
                    authorDocumentCellCommands(postToHost, at)
                }
            />,
        );
    }

    window.addEventListener("message", (event: MessageEvent) => {
        if (event.data?.type === "document") {
            cells = event.data.cells as WebviewCell[];
            draw();
        }
    });

    draw();
    postToHost({ type: "ready" });
}

main();
