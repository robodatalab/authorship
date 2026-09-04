import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../author_editor/author_document_cell_types";
import { Cell, MARKDOWN } from "../storydoc/model";
import { marked } from "marked";
import "./MarkdownCell.css";

interface MarkdownCellProps {
    cell: Cell;
}

export function MarkdownCell({ cell }: MarkdownCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Markdown</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor cell={cell}>
                    {(markdown) => (
                        <div
                            className="markdown-cell-rendered"
                            dangerouslySetInnerHTML={{
                                __html: marked.parse(markdown, {
                                    async: false,
                                    gfm: true,
                                }),
                            }}
                        />
                    )}
                </MarkdownEditor>
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    kind: MARKDOWN,
    label: "Markdown",
    category: "primary",
    render: (document, cellIndex) => (
        <MarkdownCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(MARKDOWN, "", {}),
});
