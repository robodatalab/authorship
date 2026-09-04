import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../author_file_editor_commands";
import { TITLE_PAGE, Cell } from "../../vscode_runtime/storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [
    { name: "title", label: "Title" },
    { name: "subtitle", label: "Subtitle" },
    { name: "author", label: "Author" },
    { name: "publisher", label: "Publisher" },
    { name: "date", label: "Date", hint: "YYYY-MM-DD" },
    { name: "version", label: "Version", hint: "e.g. 1.0" },
    { name: "isbn", label: "ISBN", hint: "e.g. 978-0-000-00000-0" },
];

interface TitlePageCellProps {
    cell: Cell;
}

export function TitlePageCell({ cell }: TitlePageCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Title Page</AuthorFileEditorCellHeader>
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
    kind: TITLE_PAGE,
    label: "Title Page",
    category: "secondary",
    render: (document, cellIndex) => (
        <TitlePageCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(TITLE_PAGE, "", { title: "Untitled" }),
});
