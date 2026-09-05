import {
    AuthorFileEditorCell,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
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
    fixProseError,
    replaceCellAttribute,
    replaceCellMarkdown,
} from "../../vscode_runtime/commands/author_document_edits";
import { MARKDOWN } from "../../vscode_runtime/storydoc/model";

interface MarkdownCellProps {
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function MarkdownCell({ cell, at, postToHost }: MarkdownCellProps) {
    const errors = useAuthorFileEditorCellProseErrors();
    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellWarning />}>
            <AuthorFileEditorCellHeader>Markdown</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={cell.source}
                    errors={errors}
                    onFixAsked={(error) => fixProseError(postToHost, error.id)}
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
