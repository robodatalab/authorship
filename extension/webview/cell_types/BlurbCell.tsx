import {
    AuthorFileEditorCell,
    AuthorFileEditorCellRun,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
    useAuthorFileEditorCellIsBeingWritten,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { BLURB } from "../../vscode_runtime/storydoc/model";

interface BlurbCellProps {
    cell: WebviewCell;
    cellIndex: number;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function BlurbCell({
    cell,
    cellIndex,
    sendMessagesToVscode,
}: BlurbCellProps) {
    const howFarTheCellHasBeenWritten = useAuthorFileEditorCellIsBeingWritten();
    const proseErrors = useAuthorFileEditorCellProseErrors();

    return (
        <AuthorFileEditorCell
            sidebar={
                <>
                    <AuthorFileEditorCellRun
                        isRunning={howFarTheCellHasBeenWritten !== undefined}
                        howFarAlong={howFarTheCellHasBeenWritten ?? 0}
                        onRun={() =>
                            invokeAuthorDocumentCommand(
                                sendMessagesToVscode,
                                "writeBlurb",
                                { cellIndex },
                            )
                        }
                    />
                    <AuthorFileEditorCellWarning />
                </>
            }
        >
            <AuthorFileEditorCellHeader>Blurb</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={cell.source}
                    errors={proseErrors}
                    onFixAsked={(proseError) =>
                        invokeAuthorDocumentCommand(
                            sendMessagesToVscode,
                            "fixProse",
                            {
                                ...proseError,
                            },
                        )
                    }
                    onMarkdownCommitted={(markdown) =>
                        invokeAuthorDocumentCommand(
                            sendMessagesToVscode,
                            "replaceMarkdown",
                            { cellIndex, markdown: markdown },
                        )
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: BLURB,
    menuLabel: "Blurb",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, sendMessagesToVscode) => (
        <BlurbCell
            cell={cell}
            cellIndex={cellIndex}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({ kind: BLURB, source: "", attrs: {} }),
});
