import { useState } from "react";
import type { ReactNode } from "react";
import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import { AuthorFileEditorCellCommands } from "./AuthorFileEditorCell";
import type { WebviewAuthorDocumentCommandCard } from "../../vscode_runtime/commands/author_document_command";
import type { PostToHost } from "../../vscode_runtime/commands/author_file_editor_buttons";
import { MarkdownEditorMediator } from "../markdown/MarkdownEditor";
import "./AuthorFileEditorCanvas.css";

const AUTHOR_FILE_EDITOR_PRIMARY_COMMAND_CATEGORY = "primary";

/** A cell as the page draws it, which is all the page does with one. */
export interface WebviewCell {
    readonly kind: string;
    readonly source: string;
    readonly attrs: Readonly<Record<string, string>>;
}

export type AuthorDocumentCellRenderers = Record<
    string,
    (cell: WebviewCell, at: number, postToHost: PostToHost) => ReactNode
>;

interface AuthorFileEditorCanvasProps {
    cells: WebviewCell[];
    postToHost: PostToHost;
    cellRenderers: AuthorDocumentCellRenderers;
    mainMenuCommands: WebviewAuthorDocumentCommandCard[];
    cellInsertCommandsAt: (at: number) => WebviewAuthorDocumentCommandCard[];
    cellCommandsAt: (at: number) => WebviewAuthorDocumentCommandCard[];
}

export function AuthorFileEditorCanvas({
    cells,
    postToHost,
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
                                <AuthorFileEditorCellCommands
                                    commands={cellCommandsAt(cellIndex)}
                                >
                                    {renderCell(cell, cellIndex, postToHost)}
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
    commands: WebviewAuthorDocumentCommandCard[];
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
    command: WebviewAuthorDocumentCommandCard;
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
