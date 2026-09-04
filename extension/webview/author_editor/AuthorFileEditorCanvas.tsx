import { useState } from "react";
import type { ReactNode } from "react";
import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import { AuthorFileEditorCellCommands } from "./AuthorFileEditorCell";
import type { AuthorDocumentCommand } from "./author_document_command";
import type { AuthorDocument } from "../../vscode_runtime/storydoc/model";
import { MarkdownEditorMediator } from "../markdown/MarkdownEditor";
import "./AuthorFileEditorCanvas.css";

const AUTHOR_FILE_EDITOR_PRIMARY_COMMAND_CATEGORY = "primary";

export type AuthorDocumentCellRenderers = Record<
    string,
    (document: AuthorDocument, cellIndex: number) => ReactNode
>;

interface AuthorFileEditorCanvasProps {
    document: AuthorDocument;
    cellRenderers: AuthorDocumentCellRenderers;
    mainMenuCommands: AuthorDocumentCommand[];
    cellInsertCommandsAt: (at: number) => AuthorDocumentCommand[];
    cellCommandsAt: (at: number) => AuthorDocumentCommand[];
}

export function AuthorFileEditorCanvas({
    document,
    cellRenderers,
    mainMenuCommands,
    cellInsertCommandsAt,
    cellCommandsAt,
}: AuthorFileEditorCanvasProps) {
    return (
        <div className="author-file-editor-canvas">
            <AuthorFileEditorMainMenu commands={mainMenuCommands} />
            <MarkdownEditorMediator>
                <ul>
                    <li>
                        <AuthorFileEditorInsertCellMenu
                            commands={cellInsertCommandsAt(0)}
                        />
                    </li>
                    {document.cells.map((cell, cellIndex) => {
                        const renderCell = cellRenderers[cell.kind];
                        if (!renderCell) {
                            return null;
                        }
                        return (
                            <li
                                key={cellIndex}
                                className={
                                    cell.isFolded()
                                        ? "author-file-editor-cell-folded"
                                        : undefined
                                }
                            >
                                <AuthorFileEditorCellCommands
                                    commands={cellCommandsAt(cellIndex)}
                                >
                                    {renderCell(document, cellIndex)}
                                </AuthorFileEditorCellCommands>
                                <AuthorFileEditorInsertCellMenu
                                    commands={cellInsertCommandsAt(
                                        cellIndex + 1,
                                    )}
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
    commands: AuthorDocumentCommand[];
}

function AuthorFileEditorInsertCellMenu({
    commands,
}: AuthorFileEditorInsertCellMenuProps) {
    const [overflowIsOpen, setOverflowIsOpen] = useState(false);

    const primaryCommands = commands.filter(
        (command) =>
            command.category === AUTHOR_FILE_EDITOR_PRIMARY_COMMAND_CATEGORY,
    );
    const overflowCommands = commands.filter(
        (command) =>
            command.category !== AUTHOR_FILE_EDITOR_PRIMARY_COMMAND_CATEGORY,
    );

    return (
        <div className="author-file-editor-insert-cell-menu">
            {primaryCommands.map((command) => (
                <AuthorFileEditorInsertCellMenuButton
                    key={command.tooltip}
                    command={command}
                />
            ))}
            {overflowCommands.length > 0 && (
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
                            {overflowCommands.map((command) => (
                                <AuthorFileEditorInsertCellMenuButton
                                    key={command.tooltip}
                                    command={command}
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
    command: AuthorDocumentCommand;
}

function AuthorFileEditorInsertCellMenuButton({
    command,
}: AuthorFileEditorInsertCellMenuButtonProps) {
    return (
        <button
            type="button"
            className="author-file-editor-insert-cell-menu-button"
            title={`Add a ${command.tooltip.toLowerCase()} section here`}
            onClick={command.invoke}
        >
            <i className={command.iconClassName} />
            {command.tooltip}
        </button>
    );
}
