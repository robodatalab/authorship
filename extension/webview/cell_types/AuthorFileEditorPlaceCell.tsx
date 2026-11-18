import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellHeaderTitle,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    useAuthorFileEditorCellFindHighlights,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    replaceTheCell,
    sayTheAuthorTypedInTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import { PLACE, PlaceCell } from "authordoc/cells/place_cell";

interface AuthorFileEditorPlaceCellProps {
    cell: PlaceCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorPlaceCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorPlaceCellProps) {
    const findHighlights = useAuthorFileEditorCellFindHighlights();
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Name",
            said: cell.title,
            onSaid: (title) => {
                const renamed = new PlaceCell(
                    title,
                    cell.source,
                    cell.folded,
                    cell.at,
                    cell.uniqueId,
                );
                replaceTheCell(sendMessagesToVscode, renamed);
            },
        },
    ];

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                Place
                <AuthorFileEditorCellHeaderTitle title={cell.title} />
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellFields fields={fields} />
                <MarkdownEditor
                    cellId={cell.uniqueId}
                    highlights={findHighlights}
                    markdown={cell.source}
                    timesTheHostWroteIt={timesTheHostWroteIt}
                    onMarkdownCommitted={(description) =>
                        sayTheAuthorTypedInTheCell(
                            sendMessagesToVscode,
                            cell.uniqueId,
                            description,
                        )
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: PLACE,
    menuLabel: "Place",
    insertMenuGroup: "primary",
});
