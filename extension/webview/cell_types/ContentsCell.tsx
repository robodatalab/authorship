import {
    AuthorFileEditorCell,
    AuthorFileEditorCellRun,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    useAuthorFileEditorCellIsBeingWritten,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { CONTENTS } from "../../vscode_runtime/storydoc/model";

interface ContentsCellProps {
    cell: WebviewCell;
    cellIndex: number;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function ContentsCell({
    cell,
    cellIndex,
    sendMessagesToVscode,
}: ContentsCellProps) {
    const howFarTheCellHasBeenWritten = useAuthorFileEditorCellIsBeingWritten();
    return (
        <AuthorFileEditorCell
            sidebar={
                <AuthorFileEditorCellRun
                    isRunning={howFarTheCellHasBeenWritten !== undefined}
                    howFarAlong={howFarTheCellHasBeenWritten ?? 0}
                    onRun={() =>
                        invokeAuthorDocumentCommand(
                            sendMessagesToVscode,
                            "writeTableOfContents",
                            { cellIndex },
                        )
                    }
                />
            }
        >
            <AuthorFileEditorCellHeader>
                Table of Contents
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={cell.source}
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
    cellKind: CONTENTS,
    menuLabel: "Table of Contents",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, sendMessagesToVscode) => (
        <ContentsCell
            cell={cell}
            cellIndex={cellIndex}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({ kind: CONTENTS, source: "", attrs: {} }),
});
