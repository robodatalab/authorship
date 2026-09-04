import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { AuthorDocumentCommand } from "./author_document_command";
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

interface AuthorFileEditorCellCardProps {
    children?: ReactNode;
}

const AuthorFileEditorCellCommandsContext = createContext<
    AuthorDocumentCommand[]
>([]);

interface AuthorFileEditorCellCommandsProps {
    commands: AuthorDocumentCommand[];
    children?: ReactNode;
}

export function AuthorFileEditorCellCommands({
    commands,
    children,
}: AuthorFileEditorCellCommandsProps) {
    return (
        <AuthorFileEditorCellCommandsContext.Provider value={commands}>
            {children}
        </AuthorFileEditorCellCommandsContext.Provider>
    );
}

export function AuthorFileEditorCell({ children }: AuthorFileEditorCellProps) {
    const commands = useContext(AuthorFileEditorCellCommandsContext);
    return (
        <section className="author-file-editor-cell">
            <div className="author-file-editor-cell-actions">
                {commands.map((command) => (
                    <button
                        key={command.tooltip}
                        type="button"
                        className="author-file-editor-cell-actions-button"
                        title={command.tooltip}
                        aria-label={command.tooltip}
                        onClick={command.invoke}
                    >
                        <i className={command.iconClassName} />
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

export function AuthorFileEditorCellCard({
    children,
}: AuthorFileEditorCellCardProps) {
    return <div className="author-file-editor-cell-card">{children}</div>;
}
