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

const FIELDS: AuthorFileEditorCellField[] = [{ name: "title", label: "Title" }];

interface PartCellProps {
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function PartCell({ cell, at, postToHost }: PartCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Part</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellFields
                    fields={FIELDS}
                    attributes={cell.attrs}
                    onAttributeChanged={(name, value) =>
                        replaceCellAttribute(postToHost, at, name, value)
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
        <PartCell cell={cell} at={cellIndex} postToHost={postToHost} />
    ),
    newCell: () => ({ kind: PART, source: "", attrs: { title: "Untitled" } }),
});
