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
import {
    replaceCellAttribute,
    replaceCellMarkdown,
} from "../../vscode_runtime/commands/author_document_edits";
import { MARKDOWN } from "../../vscode_runtime/storydoc/model";

interface MarkdownCellProps {
    cell: WebviewCell;
    cellIndex: number;
    postToHost: PostToHost;
}

export function MarkdownCell({
    cell,
    cellIndex,
    postToHost,
}: MarkdownCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Markdown</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={cell.source}
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
    cellKind: MARKDOWN,
    menuLabel: "Markdown",
    insertMenuGroup: "primary",
    render: (cell, cellIndex, postToHost) => (
        <MarkdownCell
            cell={cell}
            cellIndex={cellIndex}
            postToHost={postToHost}
        />
    ),
    newCell: () => ({ kind: MARKDOWN, source: "", attrs: {} }),
});
