import { createRoot, type Root } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type { SendMessagesToVscode } from "./author_editor/AuthorFileEditorCanvas";
import { AuthorFileEditorCellRenderer } from "./author_editor/AuthorFileEditorCellRenderer";
import { authorDocumentCellTypes } from "../vscode_runtime/runtime_commands/author_document_cell_types";
import { deserializeWebviewCommand } from "../vscode_runtime/webview_commands/webview_command";
import { WebviewRenderState } from "../vscode_runtime/webview_commands/webview_render_state";
import { Document } from "authordoc/storydoc";

declare function acquireVsCodeApi(): { postMessage: SendMessagesToVscode };

class WebviewCommandExecutor {
    private renderState = new WebviewRenderState();

    constructor(
        private readonly root: Root,
        private readonly sendMessagesToVscode: SendMessagesToVscode,
    ) {
        this.drawTheCanvas(this.renderState);
    }

    executeMessageReceivedFromVscodeRuntime(message: MessageEvent): void {
        const command = deserializeWebviewCommand(message.data);
        const newRenderState = command.integrate(this.renderState);
        this.drawTheCanvas(newRenderState);
        this.renderState = newRenderState;
    }

    private drawTheCanvas(renderState: WebviewRenderState): void {
        const authorDocument = Document.fromCells(renderState.cells);
        const cellRenderer = new AuthorFileEditorCellRenderer(
            this.sendMessagesToVscode,
            authorDocument,
        );
        this.root.render(
            <AuthorFileEditorCanvas
                renderState={renderState}
                cellTypes={authorDocumentCellTypes()}
                sendMessagesToVscode={this.sendMessagesToVscode}
                cellRenderer={cellRenderer}
            />,
        );
    }
}

function openTheAuthorFileEditor(): void {
    const vscodeApi = acquireVsCodeApi();
    const sendMessagesToVscode: SendMessagesToVscode = vscodeApi.postMessage;
    const rootElement = document.getElementById("author-file-editor-root")!;
    const root = createRoot(rootElement);
    const commandExecutor = new WebviewCommandExecutor(
        root,
        sendMessagesToVscode,
    );

    window.addEventListener("message", (message: MessageEvent) => {
        commandExecutor.executeMessageReceivedFromVscodeRuntime(message);
    });

    sendMessagesToVscode({ type: "ready" });
}

openTheAuthorFileEditor();
