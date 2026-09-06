import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
    invokeAuthorDocumentCommand,
    type PostToHost,
    type WebviewAuthorDocumentCommandCard,
} from "./AuthorFileEditorCanvas";
import type { ProseError } from "../linter/LinterTooltip";
import "./AuthorFileEditorCell.css";

interface AuthorFileEditorCellProps {
    sidebar?: ReactNode;
    children?: ReactNode;
}

interface AuthorFileEditorCellRunProps {
    isRunning: boolean;
    onRun: () => void;
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

interface AuthorFileEditorCellStateProps {
    cellCommands: WebviewAuthorDocumentCommandCard[];
    cellIndex: number;
    cellAttributes: Readonly<Record<string, string>>;
    proseErrors?: ProseError[];
    postToHost: PostToHost;
    children?: ReactNode;
}

const AuthorFileEditorCellStateContext = createContext<
    Omit<AuthorFileEditorCellStateProps, "children">
>({
    cellCommands: [],
    cellIndex: 0,
    cellAttributes: {},
    proseErrors: [],
    postToHost: () => undefined,
});

export function AuthorFileEditorCellState({
    cellCommands,
    cellIndex,
    cellAttributes,
    proseErrors = [],
    postToHost,
    children,
}: AuthorFileEditorCellStateProps) {
    return (
        <AuthorFileEditorCellStateContext.Provider
            value={{
                cellCommands,
                cellIndex,
                cellAttributes,
                proseErrors,
                postToHost,
            }}
        >
            {children}
        </AuthorFileEditorCellStateContext.Provider>
    );
}

function isDrawnOnCell(
    command: WebviewAuthorDocumentCommandCard,
    cellAttributes: Readonly<Record<string, string>>,
): boolean {
    return (
        !command.drawnWhenCellAttributeIs ||
        (cellAttributes[command.drawnWhenCellAttributeIs.attributeName] ??
            "") === command.drawnWhenCellAttributeIs.attributeValue
    );
}

export function AuthorFileEditorCell({
    sidebar,
    children,
}: AuthorFileEditorCellProps) {
    const { cellCommands, cellIndex, cellAttributes, postToHost } = useContext(
        AuthorFileEditorCellStateContext,
    );
    return (
        <section className="author-file-editor-cell">
            <div className="author-file-editor-cell-actions">
                {cellCommands
                    .filter((command) => isDrawnOnCell(command, cellAttributes))
                    .map((command) => (
                        <button
                            key={command.commandName}
                            type="button"
                            className="author-file-editor-cell-actions-button"
                            title={command.tooltip}
                            aria-label={command.tooltip}
                            onClick={() =>
                                invokeAuthorDocumentCommand(
                                    postToHost,
                                    command.commandName,
                                    { cellIndex },
                                )
                            }
                        >
                            <i className={command.iconClassName} />
                        </button>
                    ))}
            </div>
            <div className="author-file-editor-cell-sidebar">{sidebar}</div>
            <div className="author-file-editor-cell-main">{children}</div>
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

export function useAuthorFileEditorCellProseErrors(): ProseError[] {
    return useContext(AuthorFileEditorCellStateContext).proseErrors ?? [];
}

export function AuthorFileEditorCellWarning() {
    const proseErrors = useAuthorFileEditorCellProseErrors();

    if (proseErrors.length === 0) {
        return null;
    }

    return (
        <div
            className="author-file-editor-cell-warning"
            aria-label={`${proseErrors.length} to look at`}
        >
            <i className="codicon codicon-warning" />
        </div>
    );
}

export function AuthorFileEditorCellRun({
    isRunning,
    onRun,
}: AuthorFileEditorCellRunProps) {
    const label = isRunning ? "Writing this section…" : "Write this section";
    return (
        <button
            type="button"
            className="author-file-editor-cell-run"
            title={label}
            aria-label={label}
            disabled={isRunning}
            onClick={onRun}
        >
            <i
                className={
                    isRunning
                        ? "codicon codicon-loading codicon-modifier-spin"
                        : "codicon codicon-play"
                }
            />
        </button>
    );
}
