import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../author_file_editor_commands";
import { RECAP, Cell } from "../../vscode_runtime/storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [
    {
        name: "documents",
        label: "Documents",
        hint: "parts/part_1.author, parts/part_2.author",
    },
];

interface RecapCellProps {
    cell: Cell;
}

export function RecapCell({ cell }: RecapCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>
                The Story So Far
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
    kind: RECAP,
    label: "The Story So Far",
    category: "secondary",
    render: (document, cellIndex) => (
        <RecapCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(RECAP, "", {}),
});
