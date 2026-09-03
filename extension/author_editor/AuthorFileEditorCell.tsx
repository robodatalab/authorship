import type { ReactNode } from "react";
import "./AuthorFileEditorCell.css";

interface AuthorFileEditorCellProps {
    children?: ReactNode;
}

interface AuthorFileEditorCellHeaderProps {
    children?: ReactNode;
}

interface AuthorFileEditorCellBodyProps {
    children?: ReactNode;
}

interface AuthorFileEditorCellFooterProps {
    children?: ReactNode;
}

const AUTHOR_FILE_EDITOR_CELL_ACTIONS = [
    { iconClassName: "codicon codicon-fold-up", tooltip: "Fold this section away" },
    { iconClassName: "codicon codicon-chevron-up", tooltip: "Move up" },
    { iconClassName: "codicon codicon-chevron-down", tooltip: "Move down" },
    { iconClassName: "codicon codicon-trash", tooltip: "Delete this section" },
];

export function AuthorFileEditorCell({ children }: AuthorFileEditorCellProps) {
    return (
        <section className="author-file-editor-cell">
            <div className="author-file-editor-cell-actions">
                {AUTHOR_FILE_EDITOR_CELL_ACTIONS.map((action) => (
                    <button
                        key={action.iconClassName}
                        type="button"
                        className="author-file-editor-cell-actions-button"
                        title={action.tooltip}
                        aria-label={action.tooltip}
                    >
                        <i className={action.iconClassName} />
                    </button>
                ))}
            </div>
            {children}
        </section>
    );
}

export function AuthorFileEditorCellHeader({
    children,
}: AuthorFileEditorCellHeaderProps) {
    return (
        <section className="author-file-editor-cell-header">{children}</section>
    );
}

export function AuthorFileEditorCellBody({
    children,
}: AuthorFileEditorCellBodyProps) {
    return (
        <section className="author-file-editor-cell-body">{children}</section>
    );
}

export function AuthorFileEditorCellFooter({
    children,
}: AuthorFileEditorCellFooterProps) {
    return (
        <section className="author-file-editor-cell-footer">{children}</section>
    );
}
