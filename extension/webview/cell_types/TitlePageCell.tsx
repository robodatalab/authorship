import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type {
    SendMessagesToVscode,
    WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    replaceCellAttribute,
    replaceCellMarkdown,
} from "../../vscode_runtime/commands/author_document_edits";
import { TITLE_PAGE } from "../../vscode_runtime/storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [
    { attributeName: "title", label: "Title" },
    { attributeName: "subtitle", label: "Subtitle" },
    { attributeName: "author", label: "Author" },
    { attributeName: "publisher", label: "Publisher" },
    { attributeName: "date", label: "Date", placeholder: "YYYY-MM-DD" },
    { attributeName: "version", label: "Version", placeholder: "e.g. 1.0" },
    {
        attributeName: "isbn",
        label: "ISBN",
        placeholder: "e.g. 978-0-000-00000-0",
    },
];

interface TitlePageCellProps {
    cell: WebviewCell;
    cellIndex: number;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function TitlePageCell({
    cell,
    cellIndex,
    sendMessagesToVscode,
}: TitlePageCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Title Page</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellFields
                    fields={FIELDS}
                    cellAttributes={cell.attrs}
                    onAttributeChanged={(attributeName, attributeValue) =>
                        replaceCellAttribute(
                            sendMessagesToVscode,
                            cellIndex,
                            attributeName,
                            attributeValue,
                        )
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: TITLE_PAGE,
    menuLabel: "Title Page",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, sendMessagesToVscode) => (
        <TitlePageCell
            cell={cell}
            cellIndex={cellIndex}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({
        kind: TITLE_PAGE,
        source: "",
        attrs: { title: "Untitled" },
    }),
});
