import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type {
    SendMessagesToVscode,
    WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    replaceCellAttribute,
    replaceCellMarkdown,
} from "../../vscode_runtime/commands/author_document_edits";
import { COVER } from "../../vscode_runtime/storydoc/model";

interface CoverCellProps {
    cell: WebviewCell;
    cellIndex: number;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function CoverCell({
    cell,
    cellIndex,
    sendMessagesToVscode,
}: CoverCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Cover</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={cell.source}
                    onMarkdownCommitted={(markdown) =>
                        replaceCellMarkdown(
                            sendMessagesToVscode,
                            cellIndex,
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
    cellKind: COVER,
    menuLabel: "Cover",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, sendMessagesToVscode) => (
        <CoverCell
            cell={cell}
            cellIndex={cellIndex}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({
        kind: COVER,
        source: "![Cover](cover.jpg)",
        attrs: { src: "cover.jpg" },
    }),
});
