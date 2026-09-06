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
    cellIndex: number;
    postToHost: PostToHost;
}

export function CoverCell({ cell, cellIndex, postToHost }: CoverCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Cover</AuthorFileEditorCellHeader>
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
    cellKind: COVER,
    menuLabel: "Cover",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, postToHost) => (
        <CoverCell cell={cell} cellIndex={cellIndex} postToHost={postToHost} />
    ),
    newCell: () => ({
        kind: COVER,
        source: "![Cover](cover.jpg)",
        attrs: { src: "cover.jpg" },
    }),
});
