import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../author_file_editor_commands";
import { COVER, Cell } from "../storydoc/model";

interface CoverCellProps {
    cell: Cell;
}

export function CoverCell({ cell }: CoverCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Cover</AuthorFileEditorCellHeader>
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
    kind: COVER,
    label: "Cover",
    category: "secondary",
    render: (document, cellIndex) => (
        <CoverCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(COVER, "![Cover](cover.jpg)", { src: "cover.jpg" }),
});
