import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type {
    PostToHost,
    WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { replaceCellMarkdown } from "../../vscode_runtime/commands/author_document_edits";
import { DISCLAIMER } from "../../vscode_runtime/storydoc/model";

interface DisclaimerCellProps {
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function DisclaimerCell({ cell, at, postToHost }: DisclaimerCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Disclaimer</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={cell.source}
                    onMarkdownCommitted={(markdown) =>
                        replaceCellMarkdown(postToHost, at, markdown)
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    kind: DISCLAIMER,
    label: "Disclaimer",
    category: "secondary",
    render: (cell, at, postToHost) => (
        <DisclaimerCell cell={cell} at={at} postToHost={postToHost} />
    ),
    create: () => ({ kind: DISCLAIMER, source: "", attrs: {} }),
});
