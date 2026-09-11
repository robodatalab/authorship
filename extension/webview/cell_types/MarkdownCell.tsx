import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
    useAuthorFileEditorCellFindHighlights,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    sayTheAuthorTypedInTheCell,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { MARKDOWN } from "../../vscode_runtime/storydoc/model";

interface MarkdownCellProps {
    cell: WebviewCell;
    cellId: string;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function MarkdownCell({
    cell,
    cellId,
    sendMessagesToVscode,
}: MarkdownCellProps) {
    const proseErrors = useAuthorFileEditorCellProseErrors();
    const findHighlights = useAuthorFileEditorCellFindHighlights();

    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellWarning />}>
            <AuthorFileEditorCellHeader>Markdown</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    cellId={cellId}
                    highlights={findHighlights}
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
                        sayTheAuthorTypedInTheCell(
                            sendMessagesToVscode,
                            cellId,
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
    render: (cell, cellId, sendMessagesToVscode) => (
        <MarkdownCell
            cell={cell}
            cellId={cellId}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
});
