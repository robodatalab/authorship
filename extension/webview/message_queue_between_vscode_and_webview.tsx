import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type {
    SendMessagesToVscode,
    WebviewAuthorDocumentCommandCard,
} from "./author_editor/AuthorFileEditorCanvas";
import { AuthorFileEditorCellRenderer } from "./author_editor/AuthorFileEditorCellRenderer";
import { authorDocumentCellTypes } from "../vscode_runtime/commands/author_document_cell_types";
import type { ProseCheckError } from "../vscode_runtime/commands/check_prose";
import type { AuthorFileEditorFindMatch } from "../vscode_runtime/commands/find_in_the_document";
import type { StoryAnnotationSelected } from "../vscode_runtime/story_annotation_selection";
import type { Cell } from "../library/storydoc/cells/cell";
import type { StoryTextSpan } from "../library/storydoc/iterators/story_words_iterator";
import { parse } from "../library/storydoc/parser";

declare function acquireVsCodeApi(): { postMessage: SendMessagesToVscode };

interface WhatTheWebviewDraws {
    cells: Cell[];
    timesTheHostWroteEachCell: Record<string, number>;
    commands: WebviewAuthorDocumentCommandCard[];
    proseErrors: ProseCheckError[];
    storyAnnotationsSelected: Record<string, StoryAnnotationSelected>;
    storyTextShown: StoryTextSpan | null;
    findMatches: AuthorFileEditorFindMatch[];
    cellsBeingWritten: Record<string, number>;
    wordsInEverySection: Record<string, number>;
    wordsInTheDocument: number;
}

function cellsAsTheHostWroteThem(written: string[]): Cell[] {
    return written.flatMap((writtenCell) => parse(writtenCell));
}

function theHostWrote(cells: Cell[], drawn: WhatTheWebviewDraws): void {
    for (const cell of cells) {
        const timesBefore = drawn.timesTheHostWroteEachCell[cell.uniqueId] ?? 0;
        drawn.timesTheHostWroteEachCell[cell.uniqueId] = timesBefore + 1;
    }
}

function processMessageFromVscode(
    message: MessageEvent,
    drawn: WhatTheWebviewDraws,
): boolean {
    if (message.data?.type === "document") {
        const cells = cellsAsTheHostWroteThem(message.data.cells as string[]);
        theHostWrote(cells, drawn);
        drawn.cells = cells;
    } else if (message.data?.type === "cells") {
        const changed = cellsAsTheHostWroteThem(message.data.cells as string[]);
        const typed = cellsAsTheHostWroteThem(
            message.data.cellsThePageTyped as string[],
        );
        theHostWrote(changed, drawn);
        drawn.cells = drawn.cells.map(
            (drawing) =>
                changed.find((cell) => cell.uniqueId === drawing.uniqueId) ??
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
            .storyAnnotationsSelected as Record<string, StoryAnnotationSelected>;
    } else if (message.data?.type === "storyTextShown") {
        drawn.storyTextShown = message.data.storyTextShown as StoryTextSpan;
    } else if (message.data?.type === "findMatches") {
        drawn.findMatches = message.data
            .findMatches as AuthorFileEditorFindMatch[];
    } else if (message.data?.type === "cellsBeingWritten") {
        drawn.cellsBeingWritten = message.data.cellsBeingWritten as Record<
            string,
            number
        >;
    } else if (message.data?.type === "wordCounts") {
        drawn.wordsInEverySection = message.data.wordsInEverySection as Record<
            string,
            number
        >;
        drawn.wordsInTheDocument = message.data.wordsInTheDocument as number;
    } else {
        return false;
    }
    return true;
}

function openTheAuthorFileEditor(): void {
    const sendMessagesToVscode: SendMessagesToVscode =
        acquireVsCodeApi().postMessage;
    const root = createRoot(
        document.getElementById("author-file-editor-root")!,
    );
    const drawn: WhatTheWebviewDraws = {
        cells: [],
        timesTheHostWroteEachCell: {},
        commands: [],
        proseErrors: [],
        storyAnnotationsSelected: {},
        storyTextShown: null,
        findMatches: [],
        cellsBeingWritten: {},
        wordsInEverySection: {},
        wordsInTheDocument: 0,
    };

    const cellRenderer = new AuthorFileEditorCellRenderer(sendMessagesToVscode);

    function drawTheCanvas(): void {
        root.render(
            <AuthorFileEditorCanvas
                cells={drawn.cells}
                timesTheHostWroteEachCell={drawn.timesTheHostWroteEachCell}
                commands={drawn.commands}
                cellTypes={authorDocumentCellTypes()}
                sendMessagesToVscode={sendMessagesToVscode}
                cellRenderer={cellRenderer}
                proseErrors={drawn.proseErrors}
                storyAnnotationsSelected={drawn.storyAnnotationsSelected}
                storyTextShown={drawn.storyTextShown}
                findMatches={drawn.findMatches}
                cellsBeingWritten={drawn.cellsBeingWritten}
                wordsInEverySection={drawn.wordsInEverySection}
                wordsInTheDocument={drawn.wordsInTheDocument}
            />,
        );
    }

    window.addEventListener("message", (message: MessageEvent) => {
        if (processMessageFromVscode(message, drawn)) {
            drawTheCanvas();
        }
    });

    drawTheCanvas();
    sendMessagesToVscode({ type: "ready" });
}

openTheAuthorFileEditor();
