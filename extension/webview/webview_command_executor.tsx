import { createRoot, type Root } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type { SendMessagesToVscode } from "./author_editor/AuthorFileEditorCanvas";
import { AuthorFileEditorCellRenderer } from "./author_editor/AuthorFileEditorCellRenderer";
import { authorDocumentCellTypes } from "../vscode_runtime/runtime_commands/author_document_cell_types";
import { withEverySuggestionApplied } from "../vscode_runtime/tools/suggestions_applied";
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
        const suggestionsOfTheCellsDrawn = renderState.suggestions.filter(
            (suggestion) =>
                renderState.cells.some(
                    (cell) => cell.uniqueId === suggestion.cellId,
                ),
        );
        const storyWithTheSuggestions = Document.fromCells(
            renderState.cells,
            null,
            suggestionsOfTheCellsDrawn,
        );
        const storyAsSuggested = withEverySuggestionApplied(
            storyWithTheSuggestions,
        );
        const cellRenderer = new AuthorFileEditorCellRenderer(
            this.sendMessagesToVscode,
            storyAsSuggested,
            renderState.storyAnnotationsSelected,
            renderState.storyTextSelected,
        );
        this.root.render(
            <AuthorFileEditorCanvas
                cells={renderState.cells}
                timesTheHostWroteEachCell={
                    renderState.timesTheHostWroteEachCell
                }
                commands={renderState.commands}
                cellTypes={authorDocumentCellTypes()}
                sendMessagesToVscode={this.sendMessagesToVscode}
                cellRenderer={cellRenderer}
                proseErrors={renderState.proseErrors}
                storyAnnotationsSelected={renderState.storyAnnotationsSelected}
                storyTextShown={renderState.storyTextShown}
                findMatches={renderState.findMatches}
                cellsBeingWritten={renderState.cellsBeingWritten}
                wordsInEverySection={renderState.wordsInEverySection}
                wordsInTheDocument={renderState.wordsInTheDocument}
                storyGeneration={renderState.storyGeneration}
                suggestions={suggestionsOfTheCellsDrawn}
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
