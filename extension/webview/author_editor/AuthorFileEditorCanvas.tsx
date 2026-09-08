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
    readonly runsCellsOfKind?: string;
}

export type SendMessagesToVscode = (message: unknown) => void;

export function invokeAuthorDocumentCommand(
    sendMessagesToVscode: SendMessagesToVscode,
    commandName: string,
    commandArguments: Record<string, unknown>,
): void {
    sendMessagesToVscode({ type: "invoke", commandName, commandArguments });
}

export type AuthorDocumentCellRenderers = Record<
    string,
    (
        cell: WebviewCell,
        cellId: string,
        sendMessagesToVscode: SendMessagesToVscode,
    ) => ReactNode
>;

interface AuthorFileEditorCanvasProps {
    cells: WebviewCell[];
    commands: WebviewAuthorDocumentCommandCard[];
    cellTypes: AuthorDocumentCellType[];
    sendMessagesToVscode: SendMessagesToVscode;
    cellRenderers: AuthorDocumentCellRenderers;
    proseErrors?: ProseCheckError[];
    cellsBeingWritten?: Readonly<Record<string, number>>;
}

export function AuthorFileEditorCanvas({
    cells,
    commands,
    cellTypes,
    sendMessagesToVscode,
    cellRenderers,
    proseErrors = [],
    cellsBeingWritten = {},
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
            command.buttonGroup !== INSERT_BUTTON_GROUP &&
            command.runsCellsOfKind === undefined,
    );

    return (
        <div className="author-file-editor-canvas">
            <AuthorFileEditorMainMenu
                commands={mainMenuCommands}
                sendMessagesToVscode={sendMessagesToVscode}
            />
            <MarkdownEditorMediator>
                <ul>
                    <li>
                        <AuthorFileEditorInsertCellMenu
                            insertCommand={insertCommand}
                            cellTypes={cellTypes}
                            insertAfterCellId={null}
                            sendMessagesToVscode={sendMessagesToVscode}
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
                                    runCommand={commands.find(
                                        (command) =>
                                            command.runsCellsOfKind ===
                                            cell.kind,
                                    )}
                                    cellId={cell.attrs.id}
                                    cellAttributes={cell.attrs}
                                    proseErrors={proseErrors.filter(
                                        (proseError) =>
                                            proseError.cellId ===
                                                cell.attrs.id &&
                                            proseError.isVisible,
                                    )}
                                    howFarTheCellHasBeenWritten={
                                        cellsBeingWritten[cell.attrs.id]
                                    }
                                    sendMessagesToVscode={sendMessagesToVscode}
                                >
                                    {renderCell(
                                        cell,
                                        cell.attrs.id,
                                        sendMessagesToVscode,
                                    )}
                                </AuthorFileEditorCellState>
                                <AuthorFileEditorInsertCellMenu
                                    insertCommand={insertCommand}
                                    cellTypes={cellTypes}
                                    insertAfterCellId={cell.attrs.id}
                                    sendMessagesToVscode={sendMessagesToVscode}
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
    insertAfterCellId: string | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorFileEditorInsertCellMenu({
    insertCommand,
    cellTypes,
    insertAfterCellId,
    sendMessagesToVscode,
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
                    insertAfterCellId={insertAfterCellId}
                    sendMessagesToVscode={sendMessagesToVscode}
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
                                    insertAfterCellId={insertAfterCellId}
                                    sendMessagesToVscode={sendMessagesToVscode}
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
    insertAfterCellId: string | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorFileEditorInsertCellMenuButton({
    insertCommand,
    cellType,
    insertAfterCellId,
    sendMessagesToVscode,
}: AuthorFileEditorInsertCellMenuButtonProps) {
    return (
        <button
            type="button"
            className="author-file-editor-insert-cell-menu-button"
            title={`Add a ${cellType.menuLabel.toLowerCase()} section here`}
            onClick={() =>
                invokeAuthorDocumentCommand(
                    sendMessagesToVscode,
                    insertCommand.commandName,
                    {
                        afterCellId: insertAfterCellId,
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
