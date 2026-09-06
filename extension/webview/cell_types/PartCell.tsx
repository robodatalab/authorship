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
import { PART } from "../../vscode_runtime/storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [
    { attributeName: "title", label: "Title" },
];

interface PartCellProps {
    cell: WebviewCell;
    cellIndex: number;
    postToHost: PostToHost;
}

export function PartCell({ cell, cellIndex, postToHost }: PartCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Part</AuthorFileEditorCellHeader>
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
    cellKind: PART,
    menuLabel: "Part",
    insertMenuGroup: "secondary",
    render: (cell, cellIndex, postToHost) => (
        <PartCell cell={cell} cellIndex={cellIndex} postToHost={postToHost} />
    ),
    newCell: () => ({ kind: PART, source: "", attrs: { title: "Untitled" } }),
});
