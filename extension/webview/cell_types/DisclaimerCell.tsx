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
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { DISCLAIMER } from "../../vscode_runtime/storydoc/model";

interface DisclaimerCellProps {
    cell: WebviewCell;
    cellIndex: number;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function DisclaimerCell({
    cell,
    cellIndex,
    sendMessagesToVscode,
}: DisclaimerCellProps) {
    const proseErrors = useAuthorFileEditorCellProseErrors();

    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellWarning />}>
            <AuthorFileEditorCellHeader>Disclaimer</AuthorFileEditorCellHeader>
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
    cellKind: DISCLAIMER,
    menuLabel: "Disclaimer",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, sendMessagesToVscode) => (
        <DisclaimerCell
            cell={cell}
            cellIndex={cellIndex}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({ kind: DISCLAIMER, source: "", attrs: {} }),
});
