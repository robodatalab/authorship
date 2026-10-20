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
    replaceTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    TITLE_PAGE,
    TitlePageCell,
} from "../../library/storydoc/cells/title_page_cell";

interface AuthorFileEditorTitlePageCellProps {
    cell: TitlePageCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorTitlePageCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorTitlePageCellProps) {
    const saidOnTheTitlePage = {
        title: cell.title,
        subtitle: cell.subtitle,
        author: cell.author,
        publisher: cell.publisher,
        date: cell.date,
        version: cell.version,
        isbn: cell.isbn,
        coverDesigner: cell.coverDesigner,
    };

    function sayOnTheTitlePage(
        changed: Partial<typeof saidOnTheTitlePage>,
    ): void {
        const said = { ...saidOnTheTitlePage, ...changed };
        const titlePage = new TitlePageCell(
            said.title,
            said.subtitle,
            said.author,
            said.publisher,
            said.date,
            said.version,
            said.isbn,
            said.coverDesigner,
            cell.language,
            cell.source,
            cell.folded,
            cell.at,
            cell.uniqueId,
        );
        replaceTheCell(sendMessagesToVscode, titlePage);
    }

    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Title",
            said: cell.title,
            onSaid: (title) => sayOnTheTitlePage({ title }),
        },
        {
            label: "Subtitle",
            said: cell.subtitle,
            onSaid: (subtitle) => sayOnTheTitlePage({ subtitle }),
        },
        {
            label: "Author",
            said: cell.author,
            onSaid: (author) => sayOnTheTitlePage({ author }),
        },
        {
            label: "Publisher",
            said: cell.publisher,
            onSaid: (publisher) => sayOnTheTitlePage({ publisher }),
        },
        {
            label: "Date",
            said: cell.date,
            placeholder: "YYYY-MM-DD",
            onSaid: (date) => sayOnTheTitlePage({ date }),
        },
        {
            label: "Version",
            said: cell.version,
            placeholder: "e.g. 1.0",
            onSaid: (version) => sayOnTheTitlePage({ version }),
        },
        {
            label: "ISBN",
            said: cell.isbn,
            placeholder: "e.g. 978-0-000-00000-0",
            onSaid: (isbn) => sayOnTheTitlePage({ isbn }),
        },
        {
            label: "Cover Designer",
            said: cell.coverDesigner,
            onSaid: (coverDesigner) => sayOnTheTitlePage({ coverDesigner }),
        },
    ];

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Title Page</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellFields fields={fields} />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: TITLE_PAGE,
    menuLabel: "Title Page",
    insertMenuGroup: "secondary",
});
