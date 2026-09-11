import { createRoot } from "react-dom/client";
import { AuthorFileEditorCanvas } from "./author_editor/AuthorFileEditorCanvas";
import type {
    SendMessagesToVscode,
    WebviewAuthorDocumentCommandCard,
    WebviewCell,
} from "./author_editor/AuthorFileEditorCanvas";
import {
    authorDocumentCellRenderers,
    authorDocumentCellTypes,
} from "../vscode_runtime/commands/author_document_cell_types";
import type { ProseCheckError } from "../vscode_runtime/commands/check_prose";

declare function acquireVsCodeApi(): { postMessage: SendMessagesToVscode };

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

interface WhatTheWebviewDraws {
    cells: WebviewCell[];
    commands: WebviewAuthorDocumentCommandCard[];
    proseErrors: ProseCheckError[];
    cellsBeingWritten: Record<string, number>;
    wordsInEverySection: Record<string, number>;
    wordsInTheDocument: number;
}

function asTheHostWroteIt(
    cell: WebviewCell,
    asTheyWereDrawn: WebviewCell[],
): WebviewCell {
    const drawn = asTheyWereDrawn.find(
        (drawing) => drawing.attrs.id === cell.attrs.id,
    );
    return {
        ...cell,
        timesTheHostWroteIt: (drawn?.timesTheHostWroteIt ?? 0) + 1,
    };
}

function processMessageFromVscode(
    message: MessageEvent,
    drawn: WhatTheWebviewDraws,
): boolean {
    if (message.data?.type === "document") {
        drawn.cells = (message.data.cells as WebviewCell[]).map((cell) =>
            asTheHostWroteIt(cell, drawn.cells),
        );
    } else if (message.data?.type === "cells") {
        const changed = message.data.cells as WebviewCell[];
        drawn.cells = drawn.cells.map((drawing) => {
            const written = changed.find(
                (cell) => cell.attrs.id === drawing.attrs.id,
            );
            return written ? asTheHostWroteIt(written, drawn.cells) : drawing;
        });
    } else if (message.data?.type === "commands") {
        drawn.commands = message.data
            .commands as WebviewAuthorDocumentCommandCard[];
    } else if (message.data?.type === "proseErrors") {
        drawn.proseErrors = message.data.proseErrors as ProseCheckError[];
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
        commands: [],
        proseErrors: [],
        cellsBeingWritten: {},
        wordsInEverySection: {},
        wordsInTheDocument: 0,
    };

    function drawTheCanvas(): void {
        root.render(
            <AuthorFileEditorCanvas
                cells={drawn.cells}
                commands={drawn.commands}
                cellTypes={authorDocumentCellTypes()}
                sendMessagesToVscode={sendMessagesToVscode}
                cellRenderers={authorDocumentCellRenderers()}
                proseErrors={drawn.proseErrors}
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
