import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type {
    PostToHost,
    WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import {
    replaceCellAttribute,
    replaceCellMarkdown,
} from "../../vscode_runtime/commands/author_document_edits";
import { CHAPTER } from "../../vscode_runtime/storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [
    { attributeName: "title", label: "Title" },
];

interface ChapterCellProps {
    cell: WebviewCell;
    cellIndex: number;
    postToHost: PostToHost;
}

export function ChapterCell({ cell, cellIndex, postToHost }: ChapterCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Chapter</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellFields
                    fields={FIELDS}
                    cellAttributes={cell.attrs}
                    onAttributeChanged={(attributeName, attributeValue) =>
                        replaceCellAttribute(
                            postToHost,
                            cellIndex,
                            attributeName,
                            attributeValue,
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
    render: (cell, cellIndex, postToHost) => (
        <ChapterCell
            cell={cell}
            cellIndex={cellIndex}
            postToHost={postToHost}
        />
    ),
    newCell: () => ({
        kind: CHAPTER,
        source: "",
        attrs: { title: "Untitled" },
    }),
});
