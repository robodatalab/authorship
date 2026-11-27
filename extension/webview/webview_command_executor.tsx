import { createRoot, type Root } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type {
    SendMessagesToVscode,
    WebviewAuthorDocumentCommandCard,
} from "./author_editor/AuthorFileEditorCanvas";
import { AuthorFileEditorCellRenderer } from "./author_editor/AuthorFileEditorCellRenderer";
import { authorDocumentCellTypes } from "../vscode_runtime/runtime_commands/author_document_cell_types";
import type { ProseCheckError } from "../vscode_runtime/runtime_commands/check_prose";
import type { AuthorFileEditorFindMatch } from "../vscode_runtime/runtime_commands/find_in_the_document";
import type { StoryAnnotationSelected } from "../vscode_runtime/story_annotation_selection";
import type { StoryGeneration } from "../vscode_runtime/story_generation/story_generation";
import { withEverySuggestionApplied } from "../vscode_runtime/tools/suggestions_applied";
import type { Cell } from "authordoc/cells/cell";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";
import { parse, parseSuggestions } from "authordoc/parser";
import type { Suggestion } from "authordoc/suggestion";
import { Document } from "authordoc/storydoc";

declare function acquireVsCodeApi(): { postMessage: SendMessagesToVscode };

interface WebviewRenderState {
    cells: Cell[];
    timesTheHostWroteEachCell: Record<string, number>;
    commands: WebviewAuthorDocumentCommandCard[];
    proseErrors: ProseCheckError[];
    storyAnnotationsSelected: Record<string, StoryAnnotationSelected>;
    storyTextShown: StoryTextSpan | null;
    storyTextSelected: StoryTextSpan | null;
    findMatches: AuthorFileEditorFindMatch[];
    cellsBeingWritten: Record<string, number>;
    wordsInEverySection: Record<string, number>;
    wordsInTheDocument: number;
    storyGeneration: StoryGeneration | null;
    suggestions: Suggestion[];
}

class WebviewCommandExecutor {
    private readonly drawn: WebviewRenderState = {
        cells: [],
        timesTheHostWroteEachCell: {},
        commands: [],
        proseErrors: [],
        storyAnnotationsSelected: {},
        storyTextShown: null,
        storyTextSelected: null,
        findMatches: [],
        cellsBeingWritten: {},
        wordsInEverySection: {},
        wordsInTheDocument: 0,
        storyGeneration: null,
        suggestions: [],
    };

    constructor(
        private readonly root: Root,
        private readonly sendMessagesToVscode: SendMessagesToVscode,
    ) {}

    executeMessageReceivedFromVscodeRuntime(message: MessageEvent): void {
        const drawn = this.drawn;
        if (message.data?.type === "document") {
            const cells = this.cellsAsTheHostWroteThem(
                message.data.cells as string[],
            );
            this.theHostWrote(cells, drawn);
            drawn.cells = cells;
        } else if (message.data?.type === "cells") {
            const changed = this.cellsAsTheHostWroteThem(
                message.data.cells as string[],
            );
            const typed = this.cellsAsTheHostWroteThem(
                message.data.cellsThePageTyped as string[],
            );
            this.theHostWrote(changed, drawn);
            drawn.cells = drawn.cells.map(
                (drawing) =>
                    changed.find(
                        (cell) => cell.uniqueId === drawing.uniqueId,
                    ) ??
                    typed.find((cell) => cell.uniqueId === drawing.uniqueId) ??
                    drawing,
            );
        } else if (message.data?.type === "commands") {
            drawn.commands = message.data
                .commands as WebviewAuthorDocumentCommandCard[];
        } else if (message.data?.type === "proseErrors") {
            drawn.proseErrors = message.data.proseErrors as ProseCheckError[];
        } else if (message.data?.type === "storyAnnotationsSelected") {
            drawn.storyAnnotationsSelected = message.data
                .storyAnnotationsSelected as Record<
                string,
                StoryAnnotationSelected
            >;
        } else if (message.data?.type === "storyTextShown") {
            drawn.storyTextShown = message.data.storyTextShown as StoryTextSpan;
        } else if (message.data?.type === "storyTextSelected") {
            drawn.storyTextSelected = message.data
                .storyTextSelected as StoryTextSpan | null;
        } else if (message.data?.type === "findMatches") {
            drawn.findMatches = message.data
                .findMatches as AuthorFileEditorFindMatch[];
        } else if (message.data?.type === "cellsBeingWritten") {
            drawn.cellsBeingWritten = message.data.cellsBeingWritten as Record<
                string,
                number
            >;
        } else if (message.data?.type === "wordCounts") {
            drawn.wordsInEverySection = message.data
                .wordsInEverySection as Record<string, number>;
            drawn.wordsInTheDocument = message.data
                .wordsInTheDocument as number;
        } else if (message.data?.type === "storyGeneration") {
            drawn.storyGeneration = message.data
                .storyGeneration as StoryGeneration | null;
        } else if (message.data?.type === "suggestions") {
            drawn.suggestions = parseSuggestions(
                message.data.suggestions as string,
            );
        } else {
            return;
        }
        this.drawTheCanvas();
    }

    private theHostWrote(cells: Cell[], drawn: WebviewRenderState): void {
        for (const cell of cells) {
            const timesBefore =
                drawn.timesTheHostWroteEachCell[cell.uniqueId] ?? 0;
            drawn.timesTheHostWroteEachCell[cell.uniqueId] = timesBefore + 1;
        }
    }

    private cellsAsTheHostWroteThem(written: string[]): Cell[] {
        return written.flatMap((writtenCell) => parse(writtenCell));
    }

    private drawTheCanvas(): void {
        const drawn = this.drawn;
        const suggestionsOfTheCellsDrawn = drawn.suggestions.filter(
            (suggestion) =>
                drawn.cells.some((cell) => cell.uniqueId === suggestion.cellId),
        );
        const storyWithTheSuggestions = Document.fromCells(
            drawn.cells,
            null,
            suggestionsOfTheCellsDrawn,
        );
        const storyAsSuggested = withEverySuggestionApplied(
            storyWithTheSuggestions,
        );
        const cellRenderer = new AuthorFileEditorCellRenderer(
            this.sendMessagesToVscode,
            storyAsSuggested,
            drawn.storyAnnotationsSelected,
            drawn.storyTextSelected,
        );
        this.root.render(
            <AuthorFileEditorCanvas
                cells={drawn.cells}
                timesTheHostWroteEachCell={drawn.timesTheHostWroteEachCell}
                commands={drawn.commands}
                cellTypes={authorDocumentCellTypes()}
                sendMessagesToVscode={this.sendMessagesToVscode}
                cellRenderer={cellRenderer}
                proseErrors={drawn.proseErrors}
                storyAnnotationsSelected={drawn.storyAnnotationsSelected}
                storyTextShown={drawn.storyTextShown}
                findMatches={drawn.findMatches}
                cellsBeingWritten={drawn.cellsBeingWritten}
                wordsInEverySection={drawn.wordsInEverySection}
                wordsInTheDocument={drawn.wordsInTheDocument}
                storyGeneration={drawn.storyGeneration}
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

    commandExecutor.drawTheCanvas();
    sendMessagesToVscode({ type: "ready" });
}

openTheAuthorFileEditor();
