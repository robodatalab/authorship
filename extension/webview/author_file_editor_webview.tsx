import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type {
    PostToHost,
    WebviewAuthorDocumentCommandCard,
    WebviewCell,
} from "./author_editor/AuthorFileEditorCanvas";
import {
    authorDocumentCellRenderers,
    authorDocumentCellTypes,
} from "../vscode_runtime/commands/author_document_cell_types";

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

function openTheAuthorFileEditor(): void {
    const postToHost: PostToHost = acquireVsCodeApi().postMessage;
    const root = createRoot(
        document.getElementById("author-file-editor-root")!,
    );
    let cells: WebviewCell[] = [];
    let commands: WebviewAuthorDocumentCommandCard[] = [];

    function drawTheCanvas(): void {
        root.render(
            <AuthorFileEditorCanvas
                cells={cells}
                commands={commands}
                cellTypes={authorDocumentCellTypes()}
                postToHost={postToHost}
                cellRenderers={authorDocumentCellRenderers()}
            />,
        );
    }

    window.addEventListener("message", (event: MessageEvent) => {
        if (event.data?.type === "document") {
            cells = event.data.cells as WebviewCell[];
            drawTheCanvas();
        } else if (event.data?.type === "commands") {
            commands = event.data
                .commands as WebviewAuthorDocumentCommandCard[];
            drawTheCanvas();
        }
    });

    drawTheCanvas();
    postToHost({ type: "ready" });
}

openTheAuthorFileEditor();
