import { useState } from "react";
import type { ReactNode } from "react";
import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import { AuthorFileEditorCellState } from "./AuthorFileEditorCell";
import type { AuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type { CellAttributeCondition } from "../../vscode_runtime/commands/author_document_command";
import { MarkdownEditorMediator } from "../markdown/MarkdownEditor";
import "./AuthorFileEditorCanvas.css";

const CELL_BUTTON_GROUP = "cell";
const INSERT_BUTTON_GROUP = "insert";
const PRIMARY_INSERT_MENU_GROUP = "primary";

export interface WebviewCell {
    readonly kind: string;
    readonly source: string;
    readonly attrs: Readonly<Record<string, string>>;
}

export interface WebviewAuthorDocumentCommandCard {
    readonly commandName: string;
    readonly buttonGroup: string;
    readonly iconClassName: string;
    readonly tooltip: string;
    readonly drawnWhenCellAttributeIs?: CellAttributeCondition;
}

export type PostToHost = (message: unknown) => void;

export function invokeAuthorDocumentCommand(
    postToHost: PostToHost,
    commandName: string,
    commandArguments: Record<string, unknown>,
): void {
    postToHost({ type: "invoke", commandName, commandArguments });
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
        (command) => command.buttonGroup === CELL_BUTTON_GROUP,
    );
    const insertCommand = commands.find(
        (command) => command.buttonGroup === INSERT_BUTTON_GROUP,
    );
    const mainMenuCommands = commands.filter(
        (command) =>
            command.buttonGroup !== CELL_BUTTON_GROUP &&
            command.buttonGroup !== INSERT_BUTTON_GROUP,
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
        (cellType) => cellType.insertMenuGroup === PRIMARY_INSERT_MENU_GROUP,
    );
    const overflowCellTypes = cellTypes.filter(
        (cellType) => cellType.insertMenuGroup !== PRIMARY_INSERT_MENU_GROUP,
    );

    return (
        <div className="author-file-editor-insert-cell-menu">
            {primaryCellTypes.map((cellType) => (
                <AuthorFileEditorInsertCellMenuButton
                    key={cellType.cellKind}
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
                                    key={cellType.cellKind}
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
            title={`Add a ${cellType.menuLabel.toLowerCase()} section here`}
            onClick={() =>
                invokeAuthorDocumentCommand(postToHost, command.commandName, {
                    cellIndex: at,
                    newCell: cellType.newCell(),
                })
            }
        >
            <i className={command.iconClassName} />
            {cellType.menuLabel}
        </button>
    );
}
