import { useState } from "react";
import type { ReactNode } from "react";
import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import { AuthorFileEditorCellState } from "./AuthorFileEditorCell";
import type { AuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type { AuthorDocumentCommandVisibility } from "../../vscode_runtime/commands/author_document_command";
import { MarkdownEditorMediator } from "../markdown/MarkdownEditor";
import "./AuthorFileEditorCanvas.css";

const AUTHOR_DOCUMENT_CELL_COMMAND_CATEGORY = "cell";
const AUTHOR_DOCUMENT_INSERT_COMMAND_CATEGORY = "insert";
const AUTHOR_FILE_EDITOR_PRIMARY_CELL_TYPE_CATEGORY = "primary";

/** A cell as the page draws it, which is all the page does with one. */
export interface WebviewCell {
    readonly kind: string;
    readonly source: string;
    readonly attrs: Readonly<Record<string, string>>;
}

/** A command as the page draws it: the button, and the name to ask the host by. */
export interface WebviewAuthorDocumentCommandCard {
    readonly name: string;
    readonly category: string;
    readonly iconClassName: string;
    readonly tooltip: string;
    readonly visibleWhen?: AuthorDocumentCommandVisibility;
}

/** How the page speaks to the host: `acquireVsCodeApi().postMessage`. */
export type PostToHost = (message: unknown) => void;

export function invokeAuthorDocumentCommand(
    postToHost: PostToHost,
    command: string,
    payload: Record<string, unknown>,
): void {
    postToHost({ type: "invoke", command, payload });
}

export type AuthorDocumentCellRenderers = Record<
    string,
    (cell: WebviewCell, at: number, postToHost: PostToHost) => ReactNode
>;

interface AuthorFileEditorCanvasProps {
    cells: WebviewCell[];
    commands: WebviewAuthorDocumentCommandCard[];
    cellTypes: AuthorDocumentCellType[];
    postToHost: PostToHost;
    cellRenderers: AuthorDocumentCellRenderers;
}

export function AuthorFileEditorCanvas({
    cells,
    commands,
    cellTypes,
    postToHost,
    cellRenderers,
}: AuthorFileEditorCanvasProps) {
    const cellCommands = commands.filter(
        (command) => command.category === AUTHOR_DOCUMENT_CELL_COMMAND_CATEGORY,
    );
    const insertCommand = commands.find(
        (command) =>
            command.category === AUTHOR_DOCUMENT_INSERT_COMMAND_CATEGORY,
    );
    const mainMenuCommands = commands.filter(
        (command) =>
            command.category !== AUTHOR_DOCUMENT_CELL_COMMAND_CATEGORY &&
            command.category !== AUTHOR_DOCUMENT_INSERT_COMMAND_CATEGORY,
    );

    return (
        <div className="author-file-editor-canvas">
            <AuthorFileEditorMainMenu
                commands={mainMenuCommands}
                postToHost={postToHost}
            />
            <MarkdownEditorMediator>
                <ul>
                    <li>
                        <AuthorFileEditorInsertCellMenu
                            command={insertCommand}
                            cellTypes={cellTypes}
                            at={0}
                            postToHost={postToHost}
                        />
                    </li>
                    {cells.map((cell, cellIndex) => {
                        const renderCell = cellRenderers[cell.kind];
                        if (!renderCell) {
                            return null;
                        }
                        return (
                            <li
                                key={cellIndex}
                                className={
                                    cell.attrs.folded === "true"
                                        ? "author-file-editor-cell-folded"
                                        : undefined
                                }
                            >
                                <AuthorFileEditorCellState
                                    commands={cellCommands}
                                    at={cellIndex}
                                    attrs={cell.attrs}
                                    postToHost={postToHost}
                                >
                                    {renderCell(cell, cellIndex, postToHost)}
                                </AuthorFileEditorCellState>
                                <AuthorFileEditorInsertCellMenu
                                    command={insertCommand}
                                    cellTypes={cellTypes}
                                    at={cellIndex + 1}
                                    postToHost={postToHost}
                                />
                            </li>
                        );
                    })}
                </ul>
            </MarkdownEditorMediator>
        </div>
    );
}

interface AuthorFileEditorInsertCellMenuProps {
    command?: WebviewAuthorDocumentCommandCard;
    cellTypes: AuthorDocumentCellType[];
    at: number;
    postToHost: PostToHost;
}

function AuthorFileEditorInsertCellMenu({
    command,
    cellTypes,
    at,
    postToHost,
}: AuthorFileEditorInsertCellMenuProps) {
    const [overflowIsOpen, setOverflowIsOpen] = useState(false);

    if (!command) {
        return null;
    }

    const primaryCellTypes = cellTypes.filter(
        (cellType) =>
            cellType.category === AUTHOR_FILE_EDITOR_PRIMARY_CELL_TYPE_CATEGORY,
    );
    const overflowCellTypes = cellTypes.filter(
        (cellType) =>
            cellType.category !== AUTHOR_FILE_EDITOR_PRIMARY_CELL_TYPE_CATEGORY,
    );

    return (
        <div className="author-file-editor-insert-cell-menu">
            {primaryCellTypes.map((cellType) => (
                <AuthorFileEditorInsertCellMenuButton
                    key={cellType.kind}
                    command={command}
                    cellType={cellType}
                    at={at}
                    postToHost={postToHost}
                />
            ))}
            {overflowCellTypes.length > 0 && (
                <div className="author-file-editor-insert-cell-menu-overflow">
                    <button
                        type="button"
                        className="author-file-editor-insert-cell-menu-button"
                        title="Add any kind of section here"
                        aria-label="Add any kind of section here"
                        aria-expanded={overflowIsOpen}
                        onClick={() => setOverflowIsOpen(!overflowIsOpen)}
                    >
                        <i className="codicon codicon-ellipsis" />
                    </button>
                    {overflowIsOpen && (
                        <div className="author-file-editor-insert-cell-menu-dropdown">
                            {overflowCellTypes.map((cellType) => (
                                <AuthorFileEditorInsertCellMenuButton
                                    key={cellType.kind}
                                    command={command}
                                    cellType={cellType}
                                    at={at}
                                    postToHost={postToHost}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface AuthorFileEditorInsertCellMenuButtonProps {
    command: WebviewAuthorDocumentCommandCard;
    cellType: AuthorDocumentCellType;
    at: number;
    postToHost: PostToHost;
}

function AuthorFileEditorInsertCellMenuButton({
    command,
    cellType,
    at,
    postToHost,
}: AuthorFileEditorInsertCellMenuButtonProps) {
    return (
        <button
            type="button"
            className="author-file-editor-insert-cell-menu-button"
            title={`Add a ${cellType.label.toLowerCase()} section here`}
            onClick={() =>
                invokeAuthorDocumentCommand(postToHost, command.name, {
                    at,
                    cell: cellType.create(),
                })
            }
        >
            <i className={command.iconClassName} />
            {cellType.label}
        </button>
    );
}
