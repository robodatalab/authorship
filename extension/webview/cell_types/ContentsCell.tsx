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
import { CONTENTS } from "../../vscode_runtime/storydoc/model";

interface ContentsCellProps {
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function ContentsCell({ cell, at, postToHost }: ContentsCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                Table of Contents
            </AuthorFileEditorCellHeader>
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
    cellKind: CONTENTS,
    menuLabel: "Table of Contents",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, postToHost) => (
        <ContentsCell cell={cell} at={cellIndex} postToHost={postToHost} />
    ),
    newCell: () => ({ kind: CONTENTS, source: "", attrs: {} }),
});
