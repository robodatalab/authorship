import { useState } from "react";
import type { ReactNode } from "react";
import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import { AuthorFileEditorCellState } from "./AuthorFileEditorCell";
import type { AuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type { CellAttributeCondition } from "../../vscode_runtime/commands/author_document_command";
import type { ProseCheckError } from "../../vscode_runtime/commands/check_prose";
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
    (cell: WebviewCell, cellIndex: number, postToHost: PostToHost) => ReactNode
>;

interface AuthorFileEditorCanvasProps {
    cells: WebviewCell[];
    commands: WebviewAuthorDocumentCommandCard[];
    cellTypes: AuthorDocumentCellType[];
    postToHost: PostToHost;
    cellRenderers: AuthorDocumentCellRenderers;
    proseErrors?: ProseCheckError[];
}

export function AuthorFileEditorCanvas({
    cells,
    commands,
    cellTypes,
    postToHost,
    cellRenderers,
    proseErrors = [],
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
                            insertCommand={insertCommand}
                            cellTypes={cellTypes}
                            insertAtCellIndex={0}
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
                                    cellCommands={cellCommands}
                                    cellIndex={cellIndex}
                                    cellAttributes={cell.attrs}
                                    proseErrors={proseErrors.filter(
                                        (proseError) =>
                                            proseError.cellId ===
                                                cell.attrs.id &&
                                            proseError.isVisible,
                                    )}
                                    postToHost={postToHost}
                                >
                                    {renderCell(cell, cellIndex, postToHost)}
                                </AuthorFileEditorCellState>
                                <AuthorFileEditorInsertCellMenu
                                    insertCommand={insertCommand}
                                    cellTypes={cellTypes}
                                    insertAtCellIndex={cellIndex + 1}
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
    insertCommand?: WebviewAuthorDocumentCommandCard;
    cellTypes: AuthorDocumentCellType[];
    insertAtCellIndex: number;
    postToHost: PostToHost;
}

function AuthorFileEditorInsertCellMenu({
    insertCommand,
    cellTypes,
    insertAtCellIndex,
    postToHost,
}: AuthorFileEditorInsertCellMenuProps) {
    const [everyKindIsShown, showEveryKind] = useState(false);

    if (!insertCommand) {
        return null;
    }

    const cellTypesAlwaysShown = cellTypes.filter(
        (cellType) => cellType.insertMenuGroup === PRIMARY_INSERT_MENU_GROUP,
    );
    const cellTypesBehindTheEllipsis = cellTypes.filter(
        (cellType) => cellType.insertMenuGroup !== PRIMARY_INSERT_MENU_GROUP,
    );

    return (
        <div className="author-file-editor-insert-cell-menu">
            {cellTypesAlwaysShown.map((cellType) => (
                <AuthorFileEditorInsertCellMenuButton
                    key={cellType.cellKind}
                    insertCommand={insertCommand}
                    cellType={cellType}
                    insertAtCellIndex={insertAtCellIndex}
                    postToHost={postToHost}
                />
            ))}
            {cellTypesBehindTheEllipsis.length > 0 && (
                <div className="author-file-editor-insert-cell-menu-overflow">
                    <button
                        type="button"
                        className="author-file-editor-insert-cell-menu-button"
                        title="Add any kind of section here"
                        aria-label="Add any kind of section here"
                        aria-expanded={everyKindIsShown}
                        onClick={() => showEveryKind(!everyKindIsShown)}
                    >
                        <i className="codicon codicon-ellipsis" />
                    </button>
                    {everyKindIsShown && (
                        <div className="author-file-editor-insert-cell-menu-dropdown">
                            {cellTypesBehindTheEllipsis.map((cellType) => (
                                <AuthorFileEditorInsertCellMenuButton
                                    key={cellType.cellKind}
                                    insertCommand={insertCommand}
                                    cellType={cellType}
                                    insertAtCellIndex={insertAtCellIndex}
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
    insertCommand: WebviewAuthorDocumentCommandCard;
    cellType: AuthorDocumentCellType;
    insertAtCellIndex: number;
    postToHost: PostToHost;
}

function AuthorFileEditorInsertCellMenuButton({
    insertCommand,
    cellType,
    insertAtCellIndex,
    postToHost,
}: AuthorFileEditorInsertCellMenuButtonProps) {
    return (
        <button
            type="button"
            className="author-file-editor-insert-cell-menu-button"
            title={`Add a ${cellType.menuLabel.toLowerCase()} section here`}
            onClick={() =>
                invokeAuthorDocumentCommand(
                    postToHost,
                    insertCommand.commandName,
                    {
                        cellIndex: insertAtCellIndex,
                        newCell: cellType.newCell(),
                    },
                )
            }
        >
            <i className={insertCommand.iconClassName} />
            {cellType.menuLabel}
        </button>
    );
}
