import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellHeaderTitle,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
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
import { CHARACTER, CharacterCell } from "authordoc/cells/character_cell";

interface AuthorFileEditorCharacterCellProps {
    cell: CharacterCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorCharacterCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorCharacterCellProps) {
    const findHighlights = useAuthorFileEditorCellFindHighlights();
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Name",
            said: cell.title,
            onSaid: (title) => {
                const renamed = new CharacterCell(
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
                Character
                <AuthorFileEditorCellHeaderTitle title={cell.title} />
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields fields={fields} />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        cellId={cell.uniqueId}
                        highlights={findHighlights}
                        markdown={cell.source}
                        timesTheHostWroteIt={timesTheHostWroteIt}
                        onMarkdownCommitted={(backstory) =>
                            sayTheAuthorTypedInTheCell(
                                sendMessagesToVscode,
                                cell.uniqueId,
                                backstory,
                            )
                        }
                    />
                </AuthorFileEditorCellCard>
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: CHARACTER,
    menuLabel: "Character",
    insertMenuGroup: "primary",
});
