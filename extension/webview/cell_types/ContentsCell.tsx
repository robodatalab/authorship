import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../author_file_editor_commands";
import { CONTENTS, Cell } from "../../vscode_runtime/storydoc/model";

interface ContentsCellProps {
    cell: Cell;
}

export function ContentsCell({ cell }: ContentsCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                Table of Contents
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={cell.source}
                    onMarkdownCommitted={(markdown) =>
                        cell.replaceMarkdown(markdown)
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    kind: CONTENTS,
    label: "Table of Contents",
    category: "secondary",
    render: (document, cellIndex) => (
        <ContentsCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(CONTENTS, "", {}),
});
