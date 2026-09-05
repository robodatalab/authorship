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
    attrs: Readonly<Record<string, string>>;
    postToHost: PostToHost;
    children?: ReactNode;
}

const AuthorFileEditorCellCommandsContext = createContext<
    Omit<AuthorFileEditorCellCommandsProps, "children">
>({ commands: [], at: 0, attrs: {}, postToHost: () => undefined });

export function AuthorFileEditorCellCommands({
    commands,
    at,
    attrs,
    postToHost,
    children,
}: AuthorFileEditorCellCommandsProps) {
    return (
        <AuthorFileEditorCellCommandsContext.Provider
            value={{ commands, at, attrs, postToHost }}
        >
            {children}
        </AuthorFileEditorCellCommandsContext.Provider>
    );
}

function commandIsVisible(
    command: WebviewAuthorDocumentCommandCard,
    attrs: Readonly<Record<string, string>>,
): boolean {
    return (
        !command.visibleWhen ||
        (attrs[command.visibleWhen.attribute] ?? "") ===
            command.visibleWhen.value
    );
}

export function AuthorFileEditorCell({ children }: AuthorFileEditorCellProps) {
    const { commands, at, attrs, postToHost } = useContext(
        AuthorFileEditorCellCommandsContext,
    );
    return (
        <section className="author-file-editor-cell">
            <div className="author-file-editor-cell-actions">
                {commands
                    .filter((command) => commandIsVisible(command, attrs))
                    .map((command) => (
                        <button
                            key={command.name}
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
