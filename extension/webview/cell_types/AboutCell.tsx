import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
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
    postToHost: PostToHost;
}

export function AboutCell({ cell, cellIndex, postToHost }: AboutCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                About the Author
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
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
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        markdown={cell.source}
                        onMarkdownCommitted={(markdown) =>
                            replaceCellMarkdown(postToHost, cellIndex, markdown)
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
    render: (cell, cellIndex, postToHost) => (
        <AboutCell cell={cell} cellIndex={cellIndex} postToHost={postToHost} />
    ),
    newCell: () => ({ kind: ABOUT, source: "", attrs: {} }),
});
