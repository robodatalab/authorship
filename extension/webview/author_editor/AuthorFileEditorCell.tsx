import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
    invokeAuthorDocumentCommand,
    type PostToHost,
    type WebviewAuthorDocumentCommandCard,
    type WebviewProseError,
} from "./AuthorFileEditorCanvas";
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
    commands: WebviewAuthorDocumentCommandCard[];
    at: number;
    attrs: Readonly<Record<string, string>>;
    errors: WebviewProseError[];
    postToHost: PostToHost;
    children?: ReactNode;
}

const AuthorFileEditorCellStateContext = createContext<
    Omit<AuthorFileEditorCellStateProps, "children">
>({
    commands: [],
    at: 0,
    attrs: {},
    errors: [],
    postToHost: () => undefined,
});

/** What the host says about one cell, given to every part that draws it. */
export function AuthorFileEditorCellState({
    commands,
    at,
    attrs,
    errors,
    postToHost,
    children,
}: AuthorFileEditorCellStateProps) {
    return (
        <AuthorFileEditorCellStateContext.Provider
            value={{ commands, at, attrs, errors, postToHost }}
        >
            {children}
        </AuthorFileEditorCellStateContext.Provider>
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

export function AuthorFileEditorCell({
    sidebar,
    children,
}: AuthorFileEditorCellProps) {
    const { commands, at, attrs, postToHost } = useContext(
        AuthorFileEditorCellStateContext,
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

/**
 * What the prose checker found in this section, on the way to the page.
 *
 * The marks themselves are drawn in the editor, where the text is; a section
 * being read rather than written says only that there is something to see.
 */
/** What the checks found in the cell being drawn, for the parts that draw it. */
export function useAuthorFileEditorCellProseErrors(): WebviewProseError[] {
    return useContext(AuthorFileEditorCellStateContext).errors;
}

export function AuthorFileEditorCellWarning() {
    const { errors } = useContext(AuthorFileEditorCellStateContext);

    if (errors.length === 0) {
        return null;
    }

    return (
        <div
            className="author-file-editor-cell-warning"
            aria-label={`${errors.length} to look at`}
        >
            <i className="codicon codicon-warning" />
        </div>
    );
}

export function AuthorFileEditorCellRun({
    isRunning,
    onRun,
}: AuthorFileEditorCellRunProps) {
    const said = isRunning ? "Writing this section…" : "Write this section";
    return (
        <button
            type="button"
            className="author-file-editor-cell-run"
            title={said}
            aria-label={said}
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
