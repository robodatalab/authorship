import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type { WebviewCell } from "../author_editor/AuthorFileEditorCanvas";
import {
    replaceCellAttribute,
    replaceCellMarkdown,
    type PostToHost,
} from "../../vscode_runtime/commands/author_file_editor_buttons";
import { TITLE_PAGE } from "../../vscode_runtime/storydoc/model";

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
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function TitlePageCell({ cell, at, postToHost }: TitlePageCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Title Page</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellFields
                    fields={FIELDS}
                    attributes={cell.attrs}
                    onAttributeChanged={(name, value) =>
                        replaceCellAttribute(postToHost, at, name, value)
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
    render: (cell, at, postToHost) => (
        <TitlePageCell cell={cell} at={at} postToHost={postToHost} />
    ),
    create: () => ({
        kind: TITLE_PAGE,
        source: "",
        attrs: { title: "Untitled" },
    }),
});
