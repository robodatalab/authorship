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
import { DISCLAIMER, Cell } from "../../vscode_runtime/storydoc/model";

const FIELDS: AuthorFileEditorCellField[] = [{ name: "title", label: "Title" }];

interface DisclaimerCellProps {
    cell: Cell;
}

export function DisclaimerCell({ cell }: DisclaimerCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Disclaimer</AuthorFileEditorCellHeader>
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
    kind: DISCLAIMER,
    label: "Disclaimer",
    category: "secondary",
    render: (document, cellIndex) => (
        <DisclaimerCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(DISCLAIMER, "", {}),
});
