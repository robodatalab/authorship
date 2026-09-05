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

const FIELDS: AuthorFileEditorCellField[] = [{ name: "title", label: "Title" }];

interface ChapterCellProps {
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function ChapterCell({ cell, at, postToHost }: ChapterCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Chapter</AuthorFileEditorCellHeader>
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
    kind: CHAPTER,
    label: "Chapter",
    category: "primary",
    render: (cell, at, postToHost) => (
        <ChapterCell cell={cell} at={at} postToHost={postToHost} />
    ),
    create: () => ({ kind: CHAPTER, source: "", attrs: { title: "Untitled" } }),
});
