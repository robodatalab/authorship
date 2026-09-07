import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
    invokeAuthorDocumentCommand,
    type PostToHost,
    type WebviewAuthorDocumentCommandCard,
} from "./AuthorFileEditorCanvas";
import type { ProseCheckError } from "../../vscode_runtime/commands/check_prose";
import "./AuthorFileEditorCell.css";

interface AuthorFileEditorCellProps {
    sidebar?: ReactNode;
    children?: ReactNode;
}

interface AuthorFileEditorCellRunProps {
    isRunning: boolean;
    howFarAlong: number;
    onRun: () => void;
}

const RUN_RING_RADIUS = 7;
const RUN_RING_CIRCUMFERENCE = 2 * Math.PI * RUN_RING_RADIUS;

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
    proseErrors?: ProseCheckError[];
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

export function useAuthorFileEditorCellProseErrors(): ProseCheckError[] {
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
    howFarAlong,
    onRun,
}: AuthorFileEditorCellRunProps) {
    if (isRunning) {
        return (
            <div
                className="author-file-editor-cell-run-progress"
                role="progressbar"
                aria-label="Writing this section…"
                aria-valuenow={Math.round(howFarAlong * 100)}
            >
                <svg viewBox="0 0 16 16" width="16" height="16">
                    <circle
                        className="author-file-editor-cell-run-progress-track"
                        cx="8"
                        cy="8"
                        r={RUN_RING_RADIUS}
                    />
                    <circle
                        className="author-file-editor-cell-run-progress-written"
                        cx="8"
                        cy="8"
                        r={RUN_RING_RADIUS}
                        strokeDasharray={RUN_RING_CIRCUMFERENCE}
                        strokeDashoffset={
                            RUN_RING_CIRCUMFERENCE * (1 - howFarAlong)
                        }
                    />
                </svg>
            </div>
        );
    }

    return (
        <button
            type="button"
            className="author-file-editor-cell-run"
            title="Write this section"
            aria-label="Write this section"
            onClick={onRun}
        >
            <i className="codicon codicon-play" />
        </button>
    );
}
