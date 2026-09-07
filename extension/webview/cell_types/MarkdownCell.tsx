import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type {
    SendMessagesToVscode,
    WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    fixProseError,
    replaceCellAttribute,
    replaceCellMarkdown,
} from "../../vscode_runtime/commands/author_document_edits";
import { MARKDOWN } from "../../vscode_runtime/storydoc/model";

interface MarkdownCellProps {
    cell: WebviewCell;
    cellIndex: number;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function MarkdownCell({
    cell,
    cellIndex,
    sendMessagesToVscode,
}: MarkdownCellProps) {
    const proseErrors = useAuthorFileEditorCellProseErrors();

    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellWarning />}>
            <AuthorFileEditorCellHeader>Markdown</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={cell.source}
                    errors={proseErrors}
                    onFixAsked={(proseError) =>
                        fixProseError(sendMessagesToVscode, proseError)
                    }
                    onMarkdownCommitted={(markdown) =>
                        replaceCellMarkdown(
                            sendMessagesToVscode,
                            cellIndex,
                            markdown,
                        )
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: MARKDOWN,
    menuLabel: "Markdown",
    insertMenuGroup: "primary",
    render: (cell, cellIndex, sendMessagesToVscode) => (
        <MarkdownCell
            cell={cell}
            cellIndex={cellIndex}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({ kind: MARKDOWN, source: "", attrs: {} }),
});
