import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../author_file_editor_commands";
import { PART, PRINT, Cell } from "../storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [
    { name: "title", label: "Title" },
    {
        name: PRINT,
        label: "Printed",
        hint: "A page of its own in the book, before the chapters under it",
        toggle: true,
    },
];

interface PartCellProps {
    cell: Cell;
}

export function PartCell({ cell }: PartCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Part</AuthorFileEditorCellHeader>
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
    kind: PART,
    label: "Part",
    category: "secondary",
    render: (document, cellIndex) => (
        <PartCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(PART, "", { title: "Untitled" }),
});
