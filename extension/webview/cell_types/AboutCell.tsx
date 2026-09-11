import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
    useAuthorFileEditorCellFindHighlights,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    sayTheAuthorTypedInTheCell,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { ABOUT } from "../../vscode_runtime/storydoc/model";
import { MarkdownEditor } from "../markdown/MarkdownEditor";

const FIELDS: AuthorFileEditorCellField[] = [
    {
        attributeName: "kdp",
        label: "KDP",
        placeholder: "https://amazon.com/author/…",
    },
    { attributeName: "website", label: "Website", placeholder: "https://…" },
    {
        attributeName: "substack",
        label: "Substack",
        placeholder: "https://….substack.com",
    },
    { attributeName: "portrait", label: "Portrait", placeholder: "author.jpg" },
];

interface AboutCellProps {
    cell: WebviewCell;
    cellId: string;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AboutCell({
    cell,
    cellId,
    sendMessagesToVscode,
}: AboutCellProps) {
    const proseErrors = useAuthorFileEditorCellProseErrors();
    const findHighlights = useAuthorFileEditorCellFindHighlights();

    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellWarning />}>
            <AuthorFileEditorCellHeader>
                About the Author
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
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
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        cellId={cellId}
                        highlights={findHighlights}
                        markdown={cell.source}
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
                            cellId,
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
    render: (cell, cellId, sendMessagesToVscode) => (
        <AboutCell
            cell={cell}
            cellId={cellId}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
});
