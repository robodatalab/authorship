import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
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
    cellId: string;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function TitlePageCell({
    cell,
    cellId,
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
                        invokeAuthorDocumentCommand(
                            sendMessagesToVscode,
                            "replaceAttribute",
                            { cellId, attributeName, attributeValue },
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
    render: (cell, cellId, sendMessagesToVscode) => (
        <TitlePageCell
            cell={cell}
            cellId={cellId}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({
        kind: TITLE_PAGE,
        source: "",
        attrs: { title: "Untitled" },
    }),
});
