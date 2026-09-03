import type { ReactNode } from "react";
import { useState } from "react";
import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import type { AuthorDocumentCommand } from "./author_document_command";
import type { AuthorDocumentCellRenderers } from "./author_document_cell_renderers";
import type { Cell } from "../storydoc/model";
import "./AuthorFileEditorCanvas.css";

const AUTHOR_FILE_EDITOR_PRIMARY_COMMAND_CATEGORY = "primary";

interface AuthorFileEditorCanvasProps {
    cells: Cell[];
    cellRenderers: AuthorDocumentCellRenderers;
    mainMenuCommands: AuthorDocumentCommand[];
    cellInsertCommands: AuthorDocumentCommand[];
}

export function AuthorFileEditorCanvas({
    cells,
    cellRenderers,
    mainMenuCommands,
    cellInsertCommands,
}: AuthorFileEditorCanvasProps) {
    return (
        <div className="author-file-editor-canvas">
            <AuthorFileEditorMainMenu commands={mainMenuCommands} />
            <ul>
                <li>
                    <AuthorFileEditorInsertCellMenu
                        commands={cellInsertCommands}
                    />
                </li>
                {cells.map((cell, cellIndex) => {
                    const renderCell = cellRenderers[cell.kind];
                    if (!renderCell) {
                        return null;
                    }
                    return (
                        <li key={cellIndex}>
                            {renderCell(cell)}
                            <AuthorFileEditorInsertCellMenu
                                commands={cellInsertCommands}
                            />
                        </li>
                    );
                })}
            </ul>
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
