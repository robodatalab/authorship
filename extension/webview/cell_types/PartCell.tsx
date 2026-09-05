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
import { PART, PRINT } from "../../vscode_runtime/storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [
    { name: "title", label: "Title" },
    {
        name: PRINT,
        label: "Printed",
        hint: "A page of its own in the book, before the chapters under it",
        toggle: true,
    },
];

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
    kind: PART,
    label: "Part",
    category: "secondary",
    render: (cell, at, postToHost) => (
        <PartCell cell={cell} at={at} postToHost={postToHost} />
    ),
    create: () => ({ kind: PART, source: "", attrs: { title: "Untitled" } }),
});
