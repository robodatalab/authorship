import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { CHAPTER } from "../../vscode_runtime/storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [
    { attributeName: "title", label: "Title" },
];

interface ChapterCellProps {
    cell: WebviewCell;
    cellIndex: number;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function ChapterCell({
    cell,
    cellIndex,
    sendMessagesToVscode,
}: ChapterCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Chapter</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
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
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: CHAPTER,
    menuLabel: "Chapter",
    insertMenuGroup: "primary",
    render: (cell, cellIndex, sendMessagesToVscode) => (
        <ChapterCell
            cell={cell}
            cellIndex={cellIndex}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({
        kind: CHAPTER,
        source: "",
        attrs: { title: "Untitled" },
    }),
});
