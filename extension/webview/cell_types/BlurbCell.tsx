import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../author_file_editor_commands";
import { BLURB, Cell } from "../storydoc/model";

interface BlurbCellProps {
    cell: Cell;
}

export function BlurbCell({ cell }: BlurbCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Blurb</AuthorFileEditorCellHeader>
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
    kind: BLURB,
    label: "Blurb",
    category: "secondary",
    render: (document, cellIndex) => (
        <BlurbCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(BLURB, "", {}),
});
