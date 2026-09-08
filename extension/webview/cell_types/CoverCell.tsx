import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    useAuthorFileEditorCellFindHighlights,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { COVER } from "../../vscode_runtime/storydoc/model";

interface CoverCellProps {
    cell: WebviewCell;
    cellId: string;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function CoverCell({
    cell,
    cellId,
    sendMessagesToVscode,
}: CoverCellProps) {
    const findHighlights = useAuthorFileEditorCellFindHighlights();

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Cover</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    highlights={findHighlights}
                    markdown={cell.source}
                    onMarkdownCommitted={(markdown) =>
                        invokeAuthorDocumentCommand(
                            sendMessagesToVscode,
                            "replaceMarkdown",
                            { cellId, markdown: markdown },
                        )
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: COVER,
    menuLabel: "Cover",
    insertMenuGroup: "secondary",
    render: (cell, cellId, sendMessagesToVscode) => (
        <CoverCell
            cell={cell}
            cellId={cellId}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({
        kind: COVER,
        source: "![Cover](cover.jpg)",
        attrs: { src: "cover.jpg" },
    }),
});
