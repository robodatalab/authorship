import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import {
    invokeAuthorDocumentCommand,
    type PostToHost,
    type WebviewAuthorDocumentCommandCard,
} from "./AuthorFileEditorCanvas";
import { LinterTooltip } from "../linter/LinterTooltip";
import "./AuthorFileEditorCell.css";

interface AuthorFileEditorCellProps {
    sidebar?: ReactNode;
    children?: ReactNode;
}

interface AuthorFileEditorCellWarningProps {
    issues: string[];
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

export function AuthorFileEditorCell({
    sidebar,
    children,
}: AuthorFileEditorCellProps) {
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
export function AuthorFileEditorCellWarning({
    issues,
}: AuthorFileEditorCellWarningProps) {
    const [tooltipIsShown, showTooltip] = useState(false);

    if (issues.length === 0) {
        return null;
    }

    return (
        <div
            className="author-file-editor-cell-warning"
            onMouseEnter={() => showTooltip(true)}
            onMouseLeave={() => showTooltip(false)}
        >
            <i className="codicon codicon-warning" />
            {tooltipIsShown && <LinterTooltip issues={issues} />}
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
