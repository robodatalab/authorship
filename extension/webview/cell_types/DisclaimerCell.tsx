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
    PostToHost,
    WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    fixProseError,
    replaceCellMarkdown,
} from "../../vscode_runtime/commands/author_document_edits";
import { DISCLAIMER } from "../../vscode_runtime/storydoc/model";

interface DisclaimerCellProps {
    cell: WebviewCell;
    cellIndex: number;
    postToHost: PostToHost;
}

export function DisclaimerCell({
    cell,
    cellIndex,
    postToHost,
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
                        fixProseError(postToHost, proseError)
                    }
                    onMarkdownCommitted={(markdown) =>
                        replaceCellMarkdown(postToHost, cellIndex, markdown)
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
    render: (cell, cellIndex, postToHost) => (
        <DisclaimerCell
            cell={cell}
            cellIndex={cellIndex}
            postToHost={postToHost}
        />
    ),
    newCell: () => ({ kind: DISCLAIMER, source: "", attrs: {} }),
});
