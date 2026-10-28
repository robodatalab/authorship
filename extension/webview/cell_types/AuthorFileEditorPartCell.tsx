import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellHeaderTitle,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellWords,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    replaceTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import { PART, PartCell } from "authordoc/cells/part_cell";

interface AuthorFileEditorPartCellProps {
    cell: PartCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorPartCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorPartCellProps) {
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Title",
            said: cell.title,
            onSaid: (title) => {
                const retitled = new PartCell(
                    title,
                    cell.source,
                    cell.folded,
                    cell.at,
                    cell.uniqueId,
                );
                replaceTheCell(sendMessagesToVscode, retitled);
            },
        },
    ];

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                Part
                <AuthorFileEditorCellHeaderTitle title={cell.title} />
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellFields fields={fields} />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter>
                <AuthorFileEditorCellWords />
            </AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: PART,
    menuLabel: "Part",
    insertMenuGroup: "secondary",
});
