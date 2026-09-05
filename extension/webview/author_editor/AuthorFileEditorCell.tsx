import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
    invokeAuthorDocumentCommand,
    type PostToHost,
    type WebviewAuthorDocumentCommandCard,
} from "./AuthorFileEditorCanvas";
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

interface AuthorFileEditorCellCommandsProps {
    commands: WebviewAuthorDocumentCommandCard[];
    at: number;
    postToHost: PostToHost;
    children?: ReactNode;
}

const AuthorFileEditorCellCommandsContext = createContext<
    Omit<AuthorFileEditorCellCommandsProps, "children">
>({ commands: [], at: 0, postToHost: () => undefined });

export function AuthorFileEditorCellCommands({
    commands,
    at,
    postToHost,
    children,
}: AuthorFileEditorCellCommandsProps) {
    return (
        <AuthorFileEditorCellCommandsContext.Provider
            value={{ commands, at, postToHost }}
        >
            {children}
        </AuthorFileEditorCellCommandsContext.Provider>
    );
}

export function AuthorFileEditorCell({ children }: AuthorFileEditorCellProps) {
    const { commands, at, postToHost } = useContext(
        AuthorFileEditorCellCommandsContext,
    );
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
                        onClick={() =>
                            invokeAuthorDocumentCommand(
                                postToHost,
                                command.name,
                                { at },
                            )
                        }
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
