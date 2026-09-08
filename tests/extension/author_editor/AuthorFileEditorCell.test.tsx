import { describe, expect, it } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellRun,
    AuthorFileEditorCellState,
    AuthorFileEditorCellWarning,
    AuthorFileEditorCellWords,
} from "../../../extension/webview/author_editor/AuthorFileEditorCell";
import type { ProseCheckError } from "../../../extension/vscode_runtime/commands/check_prose";
import type { WebviewAuthorDocumentCommandCard } from "../../../extension/webview/author_editor/AuthorFileEditorCanvas";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const RUN_COMMAND: WebviewAuthorDocumentCommandCard = {
    commandName: "writeBlurb",
    buttonGroup: "run",
    iconClassName: "",
    tooltip: "",
    runsCellsOfKind: "blurb",
};

async function mount(cell: ReactNode): Promise<void> {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
        createRoot(container).render(cell);
    });
}

function sidebar(): Element {
    return document.querySelector(".author-file-editor-cell-sidebar")!;
}

async function hover(element: Element, event: string): Promise<void> {
    await act(async () => {
        element.dispatchEvent(new MouseEvent(event, { bubbles: true }));
    });
}

describe("the sidebar every cell has", () => {
    it("is there even when the cell puts nothing in it", async () => {
        await mount(
            <AuthorFileEditorCell>
                <AuthorFileEditorCellHeader>
                    Markdown
                </AuthorFileEditorCellHeader>
            </AuthorFileEditorCell>,
        );
        expect(sidebar()).not.toBeNull();
        expect(sidebar().children).toHaveLength(0);
    });

    it("holds what the cell renders into it", async () => {
        await mount(
            <AuthorFileEditorCellState
                cellCommands={[]}
                runCommand={RUN_COMMAND}
                cellId="c1"
                cellAttributes={{}}
                sendMessagesToVscode={() => undefined}
            >
                <AuthorFileEditorCell sidebar={<AuthorFileEditorCellRun />}>
                    <AuthorFileEditorCellHeader>
                        Contents
                    </AuthorFileEditorCellHeader>
                </AuthorFileEditorCell>
            </AuthorFileEditorCellState>,
        );
        expect(
            sidebar().querySelector(".author-file-editor-cell-run"),
        ).not.toBeNull();
    });

    it("leaves the cell's own parts out of it", async () => {
        await mount(
            <AuthorFileEditorCell>
                <AuthorFileEditorCellHeader>
                    Markdown
                </AuthorFileEditorCellHeader>
            </AuthorFileEditorCell>,
        );
        expect(
            sidebar().querySelector(".author-file-editor-cell-header"),
        ).toBeNull();
        expect(
            document.querySelector(
                ".author-file-editor-cell-main .author-file-editor-cell-header",
            ),
        ).not.toBeNull();
    });
});

describe("what the prose checker found", () => {
    const posted: unknown[] = [];

    function errorSaying(
        reasonForError: string,
        correctVersion = "",
    ): ProseCheckError {
        return {
            cellId: "c1",
            startCharacterOffsetInCell: 10,
            endCharacterOffsetInCell: 19,
            wordsInTheCell: "very very",
            isVisible: true,
            ruleThatFoundTheError: "echo",
            isAnErrorOf: "style",
            reasonForError,
            correctVersion,
        };
    }

    async function mountWarning(proseErrors: ProseCheckError[]): Promise<void> {
        posted.length = 0;
        await mount(
            <AuthorFileEditorCellState
                cellCommands={[]}
                cellId="c1"
                cellAttributes={{}}
                proseErrors={proseErrors}
                sendMessagesToVscode={(message) => posted.push(message)}
            >
                <AuthorFileEditorCellWarning />
            </AuthorFileEditorCellState>,
        );
    }

    function warning(): Element {
        return document.querySelector(".author-file-editor-cell-warning")!;
    }

    it("says nothing when it found nothing", async () => {
        await mountWarning([]);
        expect(
            document.querySelector(".author-file-editor-cell-warning"),
        ).toBeNull();
    });

    it("marks the cell when it found something", async () => {
        await mountWarning([errorSaying("Repeated word")]);
        expect(warning().querySelector("i")?.className).toBe(
            "codicon codicon-warning",
        );
    });

    it("says no more than that, since a mark is what carries the words", async () => {
        await mountWarning([errorSaying("Repeated word", "very")]);

        await hover(warning(), "mouseover");

        expect(document.querySelector(".linter-tooltip")).toBeNull();
    });
});

describe("the words of the section a cell opens", () => {
    async function mountWords(wordsInTheSection?: number): Promise<void> {
        await mount(
            <AuthorFileEditorCellState
                cellCommands={[]}
                cellId="c1"
                cellAttributes={{}}
                wordsInTheSection={wordsInTheSection}
                sendMessagesToVscode={() => undefined}
            >
                <AuthorFileEditorCellWords />
            </AuthorFileEditorCellState>,
        );
    }

    it("says how many the section holds", async () => {
        await mountWords(1234);
        expect(
            document.querySelector(".author-file-editor-cell-words")
                ?.textContent,
        ).toBe("1,234 words");
    });

    it("says nothing on a cell that opens no section", async () => {
        await mountWords(undefined);
        expect(
            document.querySelector(".author-file-editor-cell-words"),
        ).toBeNull();
    });
});

describe("running a cell that writes itself", () => {
    function ring(): Element {
        return document.querySelector(".author-file-editor-cell-run-progress")!;
    }

    function written(): Element {
        return document.querySelector(
            ".author-file-editor-cell-run-progress-written",
        )!;
    }

    const posted: unknown[] = [];

    async function mountRun(options: {
        runCommand?: WebviewAuthorDocumentCommandCard;
        howFarTheCellHasBeenWritten?: number;
    }): Promise<void> {
        posted.length = 0;
        await mount(
            <AuthorFileEditorCellState
                cellCommands={[]}
                runCommand={options.runCommand}
                cellId="c1"
                cellAttributes={{}}
                howFarTheCellHasBeenWritten={
                    options.howFarTheCellHasBeenWritten
                }
                sendMessagesToVscode={(message) => posted.push(message)}
            >
                <AuthorFileEditorCellRun />
            </AuthorFileEditorCellState>,
        );
    }

    it("asks for the command that runs cells of this kind", async () => {
        await mountRun({ runCommand: RUN_COMMAND });
        const button = document.querySelector(".author-file-editor-cell-run")!;
        expect(button.querySelector("i")?.className).toBe(
            "codicon codicon-play",
        );

        await act(async () => {
            button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(posted).toEqual([
            {
                type: "invoke",
                commandName: "writeBlurb",
                commandArguments: { cellId: "c1" },
            },
        ]);
    });

    it("offers nothing when no command runs cells of this kind", async () => {
        await mountRun({});

        expect(
            document.querySelector(".author-file-editor-cell-run"),
        ).toBeNull();
        expect(ring()).toBeNull();
    });

    it("becomes a ring while it runs, and offers nothing to press", async () => {
        await mountRun({
            runCommand: RUN_COMMAND,
            howFarTheCellHasBeenWritten: 0,
        });

        expect(
            document.querySelector(".author-file-editor-cell-run"),
        ).toBeNull();
        expect(ring().getAttribute("aria-valuenow")).toBe("0");
    });

    it("fills the ring as far as the writing has got", async () => {
        await mountRun({
            runCommand: RUN_COMMAND,
            howFarTheCellHasBeenWritten: 0.25,
        });

        const circumference = 2 * Math.PI * 7;
        expect(written().getAttribute("stroke-dasharray")).toBe(
            String(circumference),
        );
        expect(written().getAttribute("stroke-dashoffset")).toBe(
            String(circumference * 0.75),
        );
        expect(ring().getAttribute("aria-valuenow")).toBe("25");
    });

    it("closes the ring when the writing is done", async () => {
        await mountRun({
            runCommand: RUN_COMMAND,
            howFarTheCellHasBeenWritten: 1,
        });

        expect(written().getAttribute("stroke-dashoffset")).toBe("0");
    });
});
