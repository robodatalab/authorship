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
import {
    SALIENT_CONCEPT,
    SalientConceptCell,
} from "authordoc/cells/salient_concept_cell";

interface AuthorFileEditorSalientConceptCellProps {
    cell: SalientConceptCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorSalientConceptCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorSalientConceptCellProps) {
    const findHighlights = useAuthorFileEditorCellFindHighlights();
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Title",
            said: cell.title,
            onSaid: (title) => {
                const retitled = new SalientConceptCell(
                    title,
                    cell.references,
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
                Salient concept
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
    cellKind: SALIENT_CONCEPT,
    menuLabel: "Salient concept",
    insertMenuGroup: "primary",
});
