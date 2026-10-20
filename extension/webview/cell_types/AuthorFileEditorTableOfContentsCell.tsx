import {
    AuthorFileEditorCell,
    AuthorFileEditorCellRun,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    useAuthorFileEditorCellFindHighlights,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    sayTheAuthorTypedInTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    TABLE_OF_CONTENTS,
    type TableOfContentsCell,
} from "../../library/storydoc/cells/table_of_contents_cell";

interface AuthorFileEditorTableOfContentsCellProps {
    cell: TableOfContentsCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorTableOfContentsCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorTableOfContentsCellProps) {
    const findHighlights = useAuthorFileEditorCellFindHighlights();
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();

    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellRun />}>
            <AuthorFileEditorCellHeader>
                Table of Contents
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    cellId={cell.uniqueId}
                    highlights={findHighlights}
                    markdown={cell.source}
                    timesTheHostWroteIt={timesTheHostWroteIt}
                    onMarkdownCommitted={(markdown) =>
                        sayTheAuthorTypedInTheCell(
                            sendMessagesToVscode,
                            cell.uniqueId,
                            markdown,
                        )
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: TABLE_OF_CONTENTS,
    menuLabel: "Table of Contents",
    insertMenuGroup: "secondary",
});
