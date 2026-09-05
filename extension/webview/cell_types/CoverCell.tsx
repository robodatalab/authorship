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
import { COVER } from "../../vscode_runtime/storydoc/model";

interface CoverCellProps {
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function CoverCell({ cell, at, postToHost }: CoverCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Cover</AuthorFileEditorCellHeader>
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
    kind: COVER,
    label: "Cover",
    category: "secondary",
    render: (cell, at, postToHost) => (
        <CoverCell cell={cell} at={at} postToHost={postToHost} />
    ),
    create: () => ({
        kind: COVER,
        source: "![Cover](cover.jpg)",
        attrs: { src: "cover.jpg" },
    }),
});
