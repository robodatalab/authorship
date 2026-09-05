import {
    AuthorFileEditorCell,
    AuthorFileEditorCellWarning,
    useAuthorFileEditorCellProseErrors,
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
    fixProseError,
    replaceCellAttribute,
    replaceCellMarkdown,
} from "../../vscode_runtime/commands/author_document_edits";
import { ABOUT } from "../../vscode_runtime/storydoc/model";
import { MarkdownEditor } from "../markdown/MarkdownEditor";

const FIELDS: AuthorFileEditorCellField[] = [
    { name: "kdp", label: "KDP", hint: "https://amazon.com/author/…" },
    { name: "website", label: "Website", hint: "https://…" },
    { name: "substack", label: "Substack", hint: "https://….substack.com" },
];

interface AboutCellProps {
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function AboutCell({ cell, at, postToHost }: AboutCellProps) {
    const errors = useAuthorFileEditorCellProseErrors();
    return (
        <AuthorFileEditorCell sidebar={<AuthorFileEditorCellWarning />}>
            <AuthorFileEditorCellHeader>
                About the Author
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields
                        fields={FIELDS}
                        attributes={cell.attrs}
                        onAttributeChanged={(name, value) =>
                            replaceCellAttribute(postToHost, at, name, value)
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        markdown={cell.source}
                        errors={errors}
                        onFixAsked={(error) =>
                            fixProseError(postToHost, error.id)
                        }
                        onMarkdownCommitted={(markdown) =>
                            replaceCellMarkdown(postToHost, at, markdown)
                        }
                    />
                </AuthorFileEditorCellCard>
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    kind: ABOUT,
    label: "About the Author",
    category: "secondary",
    render: (cell, at, postToHost) => (
        <AboutCell cell={cell} at={at} postToHost={postToHost} />
    ),
    create: () => ({ kind: ABOUT, source: "", attrs: {} }),
});
