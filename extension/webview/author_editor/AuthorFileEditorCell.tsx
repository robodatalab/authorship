import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewAuthorDocumentCommandCard,
} from "./AuthorFileEditorCanvas";
import type { ProseCheckError } from "../../vscode_runtime/commands/check_prose";
import type {
    AuthorFileEditorFindHighlight,
    AuthorFileEditorFindMatch,
} from "./AuthorFileEditorFind";
import "./AuthorFileEditorCell.css";

interface AuthorFileEditorCellProps {
    sidebar?: ReactNode;
    children?: ReactNode;
}

const RUN_RING_RADIUS = 7;
const RUN_RING_CIRCUMFERENCE = 2 * Math.PI * RUN_RING_RADIUS;

interface AuthorFileEditorCellHeaderProps {
    children?: ReactNode;
}

interface AuthorFileEditorCellHeaderTitleProps {
    title?: string;
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
    runCommand?: WebviewAuthorDocumentCommandCard;
    cellId: string;
    cellAttributes: Readonly<Record<string, string>>;
    proseErrors?: ProseCheckError[];
    findMatches?: AuthorFileEditorFindMatch[];
    currentFindMatch?: AuthorFileEditorFindMatch | null;
    howFarTheCellHasBeenWritten?: number;
    wordsInTheSection?: number;
    sendMessagesToVscode: SendMessagesToVscode;
    children?: ReactNode;
}

const AuthorFileEditorCellStateContext = createContext<
    Omit<AuthorFileEditorCellStateProps, "children">
>({
    cellCommands: [],
    runCommand: undefined,
    cellId: "",
    cellAttributes: {},
    proseErrors: [],
    findMatches: [],
    currentFindMatch: null,
    howFarTheCellHasBeenWritten: undefined,
    wordsInTheSection: undefined,
    sendMessagesToVscode: () => undefined,
});

export function AuthorFileEditorCellState({
    cellCommands,
    runCommand,
    cellId,
    cellAttributes,
    proseErrors = [],
    findMatches = [],
    currentFindMatch = null,
    howFarTheCellHasBeenWritten,
    wordsInTheSection,
    sendMessagesToVscode,
    children,
}: AuthorFileEditorCellStateProps) {
    return (
        <AuthorFileEditorCellStateContext.Provider
            value={{
                cellCommands,
                runCommand,
                cellId,
                cellAttributes,
                proseErrors,
                findMatches,
                currentFindMatch,
                howFarTheCellHasBeenWritten,
                wordsInTheSection,
                sendMessagesToVscode,
            }}
        >
            {children}
        </AuthorFileEditorCellStateContext.Provider>
    );
}

export function isDrawnOnCell(
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
    const { cellCommands, cellId, cellAttributes, sendMessagesToVscode } =
        useContext(AuthorFileEditorCellStateContext);
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
                                    sendMessagesToVscode,
                                    command.commandName,
                                    { cellId },
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

export function AuthorFileEditorCellHeaderTitle({
    title,
}: AuthorFileEditorCellHeaderTitleProps) {
    if (!title) {
        return null;
    }

    return (
        <span className="author-file-editor-cell-header-title">{title}</span>
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

export function useAuthorFileEditorCellFind(): {
    matches: AuthorFileEditorFindMatch[];
    current: AuthorFileEditorFindMatch | null;
} {
    const { findMatches, currentFindMatch } = useContext(
        AuthorFileEditorCellStateContext,
    );
    return { matches: findMatches ?? [], current: currentFindMatch ?? null };
}

/** Where the cell's prose is to be marked, as the markdown editor takes it. */
export function useAuthorFileEditorCellFindHighlights(): AuthorFileEditorFindHighlight[] {
    const { matches, current } = useAuthorFileEditorCellFind();
    return matches
        .filter((match) => match.attributeName === null)
        .map((match) => ({
            at: match.at,
            end: match.end,
            isCurrent: match === current,
        }));
}

export function AuthorFileEditorCellWords() {
    const { wordsInTheSection } = useContext(AuthorFileEditorCellStateContext);

    if (wordsInTheSection === undefined) {
        return null;
    }

    return (
        <span className="author-file-editor-cell-words">
            {wordsInTheSection.toLocaleString()} words
        </span>
    );
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

export function AuthorFileEditorCellRun() {
    const {
        runCommand,
        cellId,
        howFarTheCellHasBeenWritten,
        sendMessagesToVscode,
    } = useContext(AuthorFileEditorCellStateContext);

    if (!runCommand) {
        return null;
    }

    if (howFarTheCellHasBeenWritten !== undefined) {
        const howFarAlong = howFarTheCellHasBeenWritten;
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
            onClick={() =>
                invokeAuthorDocumentCommand(
                    sendMessagesToVscode,
                    runCommand.commandName,
                    { cellId },
                )
            }
        >
            <i className="codicon codicon-play" />
        </button>
    );
}
