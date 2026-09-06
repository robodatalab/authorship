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
import { BLURB } from "../../vscode_runtime/storydoc/model";

interface BlurbCellProps {
    cell: WebviewCell;
    cellIndex: number;
    postToHost: PostToHost;
}

export function BlurbCell({ cell, cellIndex, postToHost }: BlurbCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Blurb</AuthorFileEditorCellHeader>
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
    cellKind: BLURB,
    menuLabel: "Blurb",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, postToHost) => (
        <BlurbCell cell={cell} cellIndex={cellIndex} postToHost={postToHost} />
    ),
    newCell: () => ({ kind: BLURB, source: "", attrs: {} }),
});
