import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type { WebviewCell } from "../author_editor/AuthorFileEditorCanvas";
import {
    replaceCellAttribute,
    replaceCellMarkdown,
    type PostToHost,
} from "../../vscode_runtime/commands/author_file_editor_buttons";
import { MARKDOWN } from "../../vscode_runtime/storydoc/model";

interface MarkdownCellProps {
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function MarkdownCell({ cell, at, postToHost }: MarkdownCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Markdown</AuthorFileEditorCellHeader>
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
    kind: MARKDOWN,
    label: "Markdown",
    category: "primary",
    render: (cell, at, postToHost) => (
        <MarkdownCell cell={cell} at={at} postToHost={postToHost} />
    ),
    create: () => ({ kind: MARKDOWN, source: "", attrs: {} }),
});
