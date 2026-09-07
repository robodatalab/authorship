import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
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
];

interface AboutCellProps {
    cell: WebviewCell;
    cellIndex: number;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AboutCell({
    cell,
    cellIndex,
    sendMessagesToVscode,
}: AboutCellProps) {
    const proseErrors = useAuthorFileEditorCellProseErrors();

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
                                { cellIndex, attributeName, attributeValue },
                            )
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
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
                            invokeAuthorDocumentCommand(
                                sendMessagesToVscode,
                                "replaceMarkdown",
                                { cellIndex, markdown: markdown },
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
    render: (cell, cellIndex, sendMessagesToVscode) => (
        <AboutCell
            cell={cell}
            cellIndex={cellIndex}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({ kind: ABOUT, source: "", attrs: {} }),
});
