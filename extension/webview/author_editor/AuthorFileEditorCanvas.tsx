import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import { AuthorFileEditorPartAndChapterInView } from "./AuthorFileEditorPartAndChapterInView";
import {
    AuthorFileEditorCellState,
    isDrawnOnCell,
} from "./AuthorFileEditorCell";
import {
    AuthorFileEditorFindBar,
    useAuthorFileEditorFind,
} from "./AuthorFileEditorFindBar";
import type { AuthorFileEditorFindMatch } from "./AuthorFileEditorFind";
import type { AuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type { CellAttributeCondition } from "../../vscode_runtime/commands/author_document_command";
import type { ProseCheckError } from "../../vscode_runtime/commands/check_prose";
import { FOLDED, PART } from "../../vscode_runtime/storydoc/model";
import {
    cellsBySection,
    opensASection,
    type CellsInASection,
} from "../../vscode_runtime/storydoc/sections";
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

function isFolded(cell: WebviewCell): boolean {
    return cell.attrs[FOLDED] === "true";
}

function scopeOf(cell: WebviewCell, nothingOfItsKindFollows: boolean): string {
    const scope =
        cell.kind === PART
            ? "author-file-editor-part-scope"
            : "author-file-editor-chapter-scope";
    return nothingOfItsKindFollows
        ? `${scope} author-file-editor-scope-ends`
        : scope;
}

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
    wordsInEverySection?: Readonly<Record<string, number>>;
    wordsInTheDocument?: number;
}

export function AuthorFileEditorCanvas({
    cells,
    commands,
    cellTypes,
    sendMessagesToVscode,
    cellRenderers,
    proseErrors = [],
    cellsBeingWritten = {},
    wordsInEverySection = {},
    wordsInTheDocument = 0,
}: AuthorFileEditorCanvasProps) {
    const cellCommands = commands.filter(
        (command) => command.buttonGroup === CELL_BUTTON_GROUP,
    );
    const insertCommand = commands.find(
        (command) => command.buttonGroup === INSERT_BUTTON_GROUP,
    );
    const cellsOnThePage = useRef<HTMLUListElement>(null);
    const [cellIdInView, setCellIdInView] = useState<string>();
    const find = useAuthorFileEditorFind(
        cells,
        sendMessagesToVscode,
        cellsOnThePage,
    );

    const findMatchesByCellId = useMemo(() => {
        const byCellId = new Map<string, AuthorFileEditorFindMatch[]>();
        for (const match of find.found) {
            const cellId = cells[match.cell]?.attrs.id;
            if (cellId) {
                byCellId.set(cellId, [...(byCellId.get(cellId) ?? []), match]);
            }
        }
        return byCellId;
    }, [find.found, cells]);

    useEffect(() => {
        const scrolled = cellsOnThePage.current;
        if (!scrolled) {
            return;
        }
        const cellIdsInView = new Set<string>();
        const watching = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const cellId = (entry.target as HTMLElement).dataset.cellId;
                    if (!cellId) {
                        continue;
                    }
                    if (entry.isIntersecting) {
                        cellIdsInView.add(cellId);
                    } else {
                        cellIdsInView.delete(cellId);
                    }
                }
                const first = cells.find((cell) =>
                    cellIdsInView.has(cell.attrs.id),
                );
                if (first) {
                    setCellIdInView(first.attrs.id);
                }
            },
            { root: scrolled },
        );
        for (const drawn of scrolled.querySelectorAll("li[data-cell-id]")) {
            watching.observe(drawn);
        }
        return () => watching.disconnect();
    }, [cells]);

    function everyCellIsDrawnOn(
        command: WebviewAuthorDocumentCommandCard,
    ): boolean {
        return (
            cells.length > 0 &&
            cells.every((cell) => isDrawnOnCell(command, cell.attrs))
        );
    }

    function theOneOfItsGroupTheDocumentCallsFor(
        command: WebviewAuthorDocumentCommandCard,
    ): boolean {
        const asksAboutTheCells = commands.filter(
            (other) =>
                other.buttonGroup === command.buttonGroup &&
                other.drawnWhenCellAttributeIs,
        );
        return (
            (asksAboutTheCells.find(everyCellIsDrawnOn) ??
                asksAboutTheCells[0]) === command
        );
    }

    const mainMenuCommands = commands.filter(
        (command) =>
            command.buttonGroup !== CELL_BUTTON_GROUP &&
            command.buttonGroup !== INSERT_BUTTON_GROUP &&
            command.runsCellsOfKind === undefined &&
            (command.drawnWhenCellAttributeIs === undefined ||
                theOneOfItsGroupTheDocumentCallsFor(command)),
    );

    function insertCellMenu(insertBeforeCellId: string | null): ReactNode {
        return (
            <AuthorFileEditorInsertCellMenu
                insertCommand={insertCommand}
                cellTypes={cellTypes}
                insertBeforeCellId={insertBeforeCellId}
                sendMessagesToVscode={sendMessagesToVscode}
            />
        );
    }

    function cellsInScope(
        sections: CellsInASection<WebviewCell>[],
        whatFollowsTheScope: string | null,
        scopeClassName?: string,
    ): ReactNode {
        return (
            <ul
                className={scopeClassName}
                ref={scopeClassName ? undefined : cellsOnThePage}
            >
                <li>
                    {insertCellMenu(
                        sections[0]?.cell.attrs.id ?? whatFollowsTheScope,
                    )}
                </li>
                {sections.map((section, sectionIndex) => {
                    const cell = section.cell;
                    const whatFollowsTheSection =
                        sections[sectionIndex + 1]?.cell.attrs.id ??
                        whatFollowsTheScope;
                    const renderCell = cellRenderers[cell.kind];
                    if (!renderCell) {
                        return null;
                    }
                    return (
                        <li
                            key={cell.attrs.id}
                            data-cell-id={cell.attrs.id}
                            className={
                                isFolded(cell)
                                    ? "author-file-editor-cell-folded"
                                    : undefined
                            }
                        >
                            <AuthorFileEditorCellState
                                cellCommands={cellCommands}
                                runCommand={commands.find(
                                    (command) =>
                                        command.runsCellsOfKind === cell.kind,
                                )}
                                cellId={cell.attrs.id}
                                cellAttributes={cell.attrs}
                                proseErrors={proseErrors.filter(
                                    (proseError) =>
                                        proseError.cellId === cell.attrs.id &&
                                        proseError.isVisible,
                                )}
                                findMatches={findMatchesByCellId.get(
                                    cell.attrs.id,
                                )}
                                currentFindMatch={
                                    find.current &&
                                    cells[find.current.cell]?.attrs.id ===
                                        cell.attrs.id
                                        ? find.current
                                        : null
                                }
                                howFarTheCellHasBeenWritten={
                                    cellsBeingWritten[cell.attrs.id]
                                }
                                wordsInTheSection={
                                    wordsInEverySection[cell.attrs.id]
                                }
                                sendMessagesToVscode={sendMessagesToVscode}
                            >
                                {renderCell(
                                    cell,
                                    cell.attrs.id,
                                    sendMessagesToVscode,
                                )}
                            </AuthorFileEditorCellState>
                            {opensASection(cell.kind) && !isFolded(cell)
                                ? cellsInScope(
                                      section.within,
                                      whatFollowsTheSection,
                                      scopeOf(
                                          cell,
                                          !sections
                                              .slice(sectionIndex + 1)
                                              .some(
                                                  (following) =>
                                                      following.cell.kind ===
                                                      cell.kind,
                                              ),
                                      ),
                                  )
                                : insertCellMenu(whatFollowsTheSection)}
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <div className="author-file-editor-canvas">
            <AuthorFileEditorMainMenu
                commands={mainMenuCommands}
                sendMessagesToVscode={sendMessagesToVscode}
            >
                <AuthorFileEditorPartAndChapterInView
                    cells={cells}
                    cellIdInView={cellIdInView}
                    wordsInTheDocument={wordsInTheDocument}
                />
                <AuthorFileEditorFindBar find={find} />
            </AuthorFileEditorMainMenu>
            <MarkdownEditorMediator>
                {cellsInScope(cellsBySection(cells), null)}
            </MarkdownEditorMediator>
        </div>
    );
}

interface AuthorFileEditorInsertCellMenuProps {
    insertCommand?: WebviewAuthorDocumentCommandCard;
    cellTypes: AuthorDocumentCellType[];
    insertBeforeCellId: string | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorFileEditorInsertCellMenu({
    insertCommand,
    cellTypes,
    insertBeforeCellId,
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
                    insertBeforeCellId={insertBeforeCellId}
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
                                    insertBeforeCellId={insertBeforeCellId}
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
    insertBeforeCellId: string | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

function AuthorFileEditorInsertCellMenuButton({
    insertCommand,
    cellType,
    insertBeforeCellId,
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
                        beforeCellId: insertBeforeCellId,
                        cellKind: cellType.cellKind,
                    },
                )
            }
        >
            <i className={insertCommand.iconClassName} />
            {cellType.menuLabel}
        </button>
    );
}
