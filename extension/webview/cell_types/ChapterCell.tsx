import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellWords,
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
    cellId: string;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function ChapterCell({
    cell,
    cellId,
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
                            { cellId, attributeName, attributeValue },
                        )
                    }
                />
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter>
                <AuthorFileEditorCellWords />
            </AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: CHAPTER,
    menuLabel: "Chapter",
    insertMenuGroup: "primary",
    render: (cell, cellId, sendMessagesToVscode) => (
        <ChapterCell
            cell={cell}
            cellId={cellId}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
    newCell: () => ({
        kind: CHAPTER,
        source: "",
        attrs: { title: "Untitled" },
    }),
});
