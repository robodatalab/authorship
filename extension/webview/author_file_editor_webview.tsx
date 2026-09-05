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

function main(): void {
    const postToHost: PostToHost = acquireVsCodeApi().postMessage;
    const root = createRoot(
        document.getElementById("author-file-editor-root")!,
    );
    let cells: WebviewCell[] = [];
    let commands: WebviewAuthorDocumentCommandCard[] = [];

    function draw(): void {
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
            draw();
        } else if (event.data?.type === "commands") {
            commands = event.data
                .commands as WebviewAuthorDocumentCommandCard[];
            draw();
        }
    });

    draw();
    postToHost({ type: "ready" });
}

main();
