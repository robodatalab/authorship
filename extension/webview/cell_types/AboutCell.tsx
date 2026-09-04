import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { registerAuthorDocumentCellType } from "../author_file_editor_commands";
import { ABOUT, Cell } from "../../vscode_runtime/storydoc/model";
import { MarkdownEditor } from "../markdown/MarkdownEditor";

const FIELDS: AuthorFileEditorCellField[] = [
    { name: "kdp", label: "KDP", hint: "https://amazon.com/author/…" },
    { name: "website", label: "Website", hint: "https://…" },
    { name: "substack", label: "Substack", hint: "https://….substack.com" },
];

interface AboutCellProps {
    cell: Cell;
}

export function AboutCell({ cell }: AboutCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                About the Author
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields
                        fields={FIELDS}
                        attributes={cell.attrs}
                        onAttributeChanged={(name, value) =>
                            cell.replaceAttribute(name, value)
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        markdown={cell.source}
                        onMarkdownCommitted={(markdown) =>
                            cell.replaceMarkdown(markdown)
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
    render: (document, cellIndex) => (
        <AboutCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(ABOUT, "", {}),
});
