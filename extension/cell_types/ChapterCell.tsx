import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../author_file_editor_commands";
import { CHAPTER, Cell } from "../storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [{ name: "title", label: "Title" }];

interface ChapterCellProps {
    cell: Cell;
}

export function ChapterCell({ cell }: ChapterCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Chapter</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellFields
                    fields={FIELDS}
                    attributes={cell.attrs}
                    onAttributeChanged={(name, value) =>
                        cell.replaceAttribute(name, value)
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    kind: CHAPTER,
    label: "Chapter",
    category: "primary",
    render: (document, cellIndex) => (
        <ChapterCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(CHAPTER, "", { title: "Untitled" }),
});
