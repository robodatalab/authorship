import { AuthorFileEditorCellActions } from "../author_editor/AuthorFileEditorCell";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import { DIVIDER } from "../../vscode_runtime/storydoc/model";
import "./DividerCell.css";

export function DividerCell() {
    return (
        <section className="divider-cell">
            <AuthorFileEditorCellActions />
            <i className="codicon codicon-fold divider-cell-mark" />
            <span className="divider-cell-label">Divider</span>
            <i className="codicon codicon-fold divider-cell-mark" />
        </section>
    );
}

registerAuthorDocumentCellType({
    cellKind: DIVIDER,
    menuLabel: "Divider",
    insertMenuGroup: "secondary",
    render: () => <DividerCell />,
});
