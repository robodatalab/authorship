import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
    useAuthorFileEditorCellFindHighlights,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    replaceTheCell,
    sayTheAuthorTypedInTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import { ABOUT, AboutCell } from "authordoc/cells/about_cell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";

interface AuthorFileEditorAboutCellProps {
    cell: AboutCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorAboutCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorAboutCellProps) {
    const proseErrors = useAuthorFileEditorCellProseErrors();
    const findHighlights = useAuthorFileEditorCellFindHighlights();
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();

    const saidAboutTheAuthor = {
        kdp: cell.kdp,
        website: cell.website,
        substack: cell.substack,
        portrait: cell.portrait,
    };

    function sayAboutTheAuthor(
        changed: Partial<typeof saidAboutTheAuthor>,
    ): void {
        const said = { ...saidAboutTheAuthor, ...changed };
        const about = new AboutCell(
            said.kdp,
            said.website,
            said.substack,
            said.portrait,
            cell.source,
            cell.folded,
            cell.at,
            cell.uniqueId,
        );
        replaceTheCell(sendMessagesToVscode, about);
    }

    const fields: AuthorFileEditorCellField[] = [
        {
            label: "KDP",
            said: cell.kdp,
            placeholder: "https://amazon.com/author/…",
            onSaid: (kdp) => sayAboutTheAuthor({ kdp }),
        },
        {
            label: "Website",
            said: cell.website,
            placeholder: "https://…",
            onSaid: (website) => sayAboutTheAuthor({ website }),
        },
        {
            label: "Substack",
            said: cell.substack,
            placeholder: "https://….substack.com",
            onSaid: (substack) => sayAboutTheAuthor({ substack }),
        },
        {
            label: "Portrait",
            said: cell.portrait,
            placeholder: "author.jpg",
            onSaid: (portrait) => sayAboutTheAuthor({ portrait }),
        },
    ];

    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellWarning />}>
            <AuthorFileEditorCellHeader>
                About the Author
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
                        errors={proseErrors}
                        onFixAsked={(proseError) =>
                            invokeAuthorDocumentCommand(
                                sendMessagesToVscode,
                                "fixProse",
                                {
                                    ...proseError,
                                },
                            )
                        }
                        onMarkdownCommitted={(markdown) =>
                            sayTheAuthorTypedInTheCell(
                                sendMessagesToVscode,
                                cell.uniqueId,
                                markdown,
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
    cellKind: ABOUT,
    menuLabel: "About the Author",
    insertMenuGroup: "secondary",
});
