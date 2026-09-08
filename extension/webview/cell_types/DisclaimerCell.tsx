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
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { DISCLAIMER } from "../../vscode_runtime/storydoc/model";

interface DisclaimerCellProps {
    cell: WebviewCell;
    cellId: string;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function DisclaimerCell({
    cell,
    cellId,
    sendMessagesToVscode,
}: DisclaimerCellProps) {
    const proseErrors = useAuthorFileEditorCellProseErrors();
    const findHighlights = useAuthorFileEditorCellFindHighlights();

    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellWarning />}>
            <AuthorFileEditorCellHeader>Disclaimer</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
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
                        invokeAuthorDocumentCommand(
                            sendMessagesToVscode,
                            "replaceMarkdown",
                            { cellId, markdown: markdown },
                        )
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: DISCLAIMER,
    menuLabel: "Disclaimer",
    insertMenuGroup: "secondary",
    render: (cell, cellId, sendMessagesToVscode) => (
        <DisclaimerCell
            cell={cell}
            cellId={cellId}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({ kind: DISCLAIMER, source: "", attrs: {} }),
});
