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
import {
    AuthorFileEditorOverviewRuler,
    type AuthorFileEditorOverviewRulerArrow,
    type AuthorFileEditorOverviewRulerMark,
} from "./AuthorFileEditorOverviewRuler";
import type { AuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type { ProseCheckError } from "../../vscode_runtime/commands/check_prose";
import type { AuthorFileEditorFindMatch } from "../../vscode_runtime/commands/find_in_the_document";
import type { Cell } from "../../library/storydoc/cells/cell";
import type { CellVisitor } from "../../library/storydoc/cells/cell_visitor";
import { PART } from "../../library/storydoc/cells/part_cell";
import { StoryAnnotationsIterator } from "../../library/storydoc/iterators/story_annotations_iterator";
import {
    StoryWordsIterator,
    type StoryTextSpan,
} from "../../library/storydoc/iterators/story_words_iterator";
import {
    cellsBySection,
    opensASection,
    type CellsInASection,
} from "../../library/storydoc/story_sections";
import { Document } from "../../library/storydoc/storydoc";
import {
    NO_STORY_ANNOTATION_SELECTED,
    STORY_ANNOTATION_KINDS,
    type StoryAnnotationSelected,
} from "../../vscode_runtime/story_annotation_selection";
import {
    MarkdownEditorMediator,
    type MarkdownEditorStoryTextHighlight,
} from "../markdown/MarkdownEditor";
import "./AuthorFileEditorCanvas.css";

const CELL_BUTTON_GROUP = "cell";
const INSERT_BUTTON_GROUP = "insert";
const PRIMARY_INSERT_MENU_GROUP = "primary";

export interface WebviewAuthorDocumentCommandCard {
    readonly commandName: string;
    readonly buttonGroup: string;
    readonly iconClassName: string;
    readonly tooltip: string;
    readonly drawnWhenTheCellIsFolded?: boolean;
    readonly runsCellsOfKind?: string;
}

export type SendMessagesToVscode = (message: unknown) => void;

function theInnermostCellInView(
    sections: CellsInASection<Cell>[],
    cellIdsInView: Set<string>,
): string | undefined {
    const first = sections.find((section) =>
        cellIdsInView.has(section.cell.uniqueId),
    );
    if (!first) {
        return undefined;
    }
    return (
        theInnermostCellInView(first.within, cellIdsInView) ??
        first.cell.uniqueId
    );
}

function scopeOf(cell: Cell, nothingOfItsKindFollows: boolean): string {
    const scope =
        cell.kind === PART
            ? "author-file-editor-part-scope"
            : "author-file-editor-chapter-scope";
    return nothingOfItsKindFollows
        ? `${scope} author-file-editor-scope-ends`
        : scope;
}

export function sayTheAuthorTypedInTheCell(
    sendMessagesToVscode: SendMessagesToVscode,
    cellId: string,
    markdown: string,
): void {
    sendMessagesToVscode({ type: "typed", cellId, markdown });
}

export function invokeAuthorDocumentCommand(
    sendMessagesToVscode: SendMessagesToVscode,
    commandName: string,
    commandArguments: Record<string, unknown>,
): void {
    sendMessagesToVscode({ type: "invoke", commandName, commandArguments });
}

export function replaceTheCell(
    sendMessagesToVscode: SendMessagesToVscode,
    cell: Cell,
): void {
    const written = Document.fromCells([cell]);
    invokeAuthorDocumentCommand(sendMessagesToVscode, "replaceCell", {
        cell: written.text,
    });
}

interface AuthorFileEditorCanvasProps {
    cells: Cell[];
    timesTheHostWroteEachCell?: Readonly<Record<string, number>>;
    commands: WebviewAuthorDocumentCommandCard[];
    cellTypes: AuthorDocumentCellType[];
    sendMessagesToVscode: SendMessagesToVscode;
    cellRenderer: CellVisitor<ReactNode>;
    proseErrors?: ProseCheckError[];
    storyAnnotationsSelected?: Readonly<Record<string, StoryAnnotationSelected>>;
    storyTextShown?: StoryTextSpan | null;
    findMatches?: AuthorFileEditorFindMatch[];
    cellsBeingWritten?: Readonly<Record<string, number>>;
    wordsInEverySection?: Readonly<Record<string, number>>;
    wordsInTheDocument?: number;
}

export function AuthorFileEditorCanvas({
    cells,
    timesTheHostWroteEachCell = {},
    commands,
    cellTypes,
    sendMessagesToVscode,
    cellRenderer,
    proseErrors = [],
    storyAnnotationsSelected = {},
    storyTextShown = null,
    findMatches = [],
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
    const sections = useMemo(() => cellsBySection(cells), [cells]);
    const storyDocument = useMemo(() => Document.fromCells(cells), [cells]);
    const storyWords = useMemo(
        () => new StoryWordsIterator(storyDocument),
        [storyDocument],
    );
    const storyAnnotationsShown = useMemo(
        () =>
            STORY_ANNOTATION_KINDS.map((cellKind) => {
                const storyAnnotations = new StoryAnnotationsIterator(
                    storyDocument,
                    cellKind,
                );
                const annotations = Array.from(storyAnnotations);
                const selected =
                    storyAnnotationsSelected[cellKind] ??
                    NO_STORY_ANNOTATION_SELECTED;
                const highlightColor = annotations.findIndex(
                    (annotation) =>
                        annotation.annotationCellId ===
                        selected.annotationCellId,
                );
                const passagesOfTheAnnotation =
                    annotations[highlightColor]?.passages ?? [];
                const passages = passagesOfTheAnnotation.map(
                    (storyWordRange) => storyWords.spans(storyWordRange),
                );
                const passageIds = passagesOfTheAnnotation.map(
                    (storyWordRange) => storyWordRange.passageId,
                );
                const passageSelected = passagesOfTheAnnotation.findIndex(
                    (storyWordRange) =>
                        storyWordRange.passageId === selected.passageId,
                );
                return {
                    cellKind,
                    annotationCellId: selected.annotationCellId,
                    highlightColor,
                    passages,
                    passageIds,
                    passageSelected:
                        passageSelected === -1 ? null : passageSelected,
                };
            }),
        [storyDocument, storyWords, storyAnnotationsSelected],
    );
    const storyTextHighlightsByCellId = useMemo(() => {
        const byCellId = new Map<
            string,
            MarkdownEditorStoryTextHighlight[]
        >();
        for (const annotation of storyAnnotationsShown) {
            annotation.passages.forEach((passage, passageIndex) => {
                for (const span of passage) {
                    byCellId.set(span.cellId, [
                        ...(byCellId.get(span.cellId) ?? []),
                        {
                            startCharacterOffsetInCell:
                                span.startCharacterOffsetInCell,
                            endCharacterOffsetInCell:
                                span.endCharacterOffsetInCell,
                            highlightColor: annotation.highlightColor,
                            emphasized:
                                passageIndex === annotation.passageSelected,
                        },
                    ]);
                }
            });
        }
        return byCellId;
    }, [storyAnnotationsShown]);
    const whatTheOverviewRulerShows = useMemo(() => {
        const marks: AuthorFileEditorOverviewRulerMark[] = [];
        const arrows: AuthorFileEditorOverviewRulerArrow[] = [];
        for (const annotation of storyAnnotationsShown) {
            const firstMark = marks.length;
            annotation.passages.forEach((passage, passageIndex) =>
                marks.push({
                    storyText: passage,
                    highlightColor: annotation.highlightColor,
                    dimmed:
                        annotation.passageSelected !== null &&
                        passageIndex !== annotation.passageSelected,
                }),
            );
            const passageSelected = annotation.passageSelected;
            const plotCell = storyDocument
                .plots()
                .find((plot) => plot.uniqueId === annotation.annotationCellId);
            if (plotCell === undefined || passageSelected === null) {
                continue;
            }
            const nodeIds = plotCell.nodes.map((node) => node.nodeId);
            const nodeSelected = nodeIds[passageSelected];
            for (const edge of plotCell.edges) {
                const fromPassage = nodeIds.indexOf(edge.fromNodeId);
                const toPassage = nodeIds.indexOf(edge.toNodeId);
                const touchesTheNodeSelected =
                    edge.fromNodeId === nodeSelected ||
                    edge.toNodeId === nodeSelected;
                if (!touchesTheNodeSelected || fromPassage < 0 || toPassage < 0) {
                    continue;
                }
                arrows.push({
                    fromMark: firstMark + fromPassage,
                    toMark: firstMark + toPassage,
                });
            }
        }
        return { marks, arrows };
    }, [storyAnnotationsShown, storyDocument]);

    function selectThePassagesClicked(cellId: string, clickedAt: number): void {
        for (const annotation of storyAnnotationsShown) {
            const passageClicked = annotation.passages.findIndex((passage) =>
                passage.some(
                    (span) =>
                        span.cellId === cellId &&
                        span.startCharacterOffsetInCell <= clickedAt &&
                        clickedAt < span.endCharacterOffsetInCell,
                ),
            );
            if (passageClicked >= 0) {
                sendMessagesToVscode({
                    type: "selectPassage",
                    cellKind: annotation.cellKind,
                    passageId: annotation.passageIds[passageClicked],
                });
            }
        }
    }

    const cellsOnThePage = useRef<HTMLUListElement>(null);
    const [cellIdInView, setCellIdInView] = useState<string>();
    const find = useAuthorFileEditorFind(
        findMatches,
        sendMessagesToVscode,
        cellsOnThePage,
    );

    const findMatchesByCellId = useMemo(() => {
        const byCellId = new Map<string, AuthorFileEditorFindMatch[]>();
        for (const match of find.found) {
            byCellId.set(match.cellId, [
                ...(byCellId.get(match.cellId) ?? []),
                match,
            ]);
        }
        return byCellId;
    }, [find.found]);

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
                const inView = theInnermostCellInView(sections, cellIdsInView);
                if (inView) {
                    setCellIdInView(inView);
                }
            },
            { root: scrolled },
        );
        for (const drawn of scrolled.querySelectorAll("li[data-cell-id]")) {
            watching.observe(drawn);
        }
        return () => watching.disconnect();
    }, [sections]);

    function everyCellIsDrawnOn(
        command: WebviewAuthorDocumentCommandCard,
    ): boolean {
        return (
            cells.length > 0 &&
            cells.every((cell) => isDrawnOnCell(command, cell.folded))
        );
    }

    function theOneOfItsGroupTheDocumentCallsFor(
        command: WebviewAuthorDocumentCommandCard,
    ): boolean {
        const asksAboutTheCells = commands.filter(
            (other) =>
                other.buttonGroup === command.buttonGroup &&
                other.drawnWhenTheCellIsFolded !== undefined,
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
            (command.drawnWhenTheCellIsFolded === undefined ||
                theOneOfItsGroupTheDocumentCallsFor(command)),
    );

    function bringTheStoryTextIntoView(top: number, bottom: number): void {
        const scrolled = cellsOnThePage.current;
        if (!scrolled) {
            return;
        }
        scrolled.scrollTop +=
            (top + bottom) / 2 -
            scrolled.getBoundingClientRect().top -
            scrolled.clientHeight / 2;
    }

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
        sections: CellsInASection<Cell>[],
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
                        sections[0]?.cell.uniqueId ?? whatFollowsTheScope,
                    )}
                </li>
                {sections.map((section, sectionIndex) => {
                    const cell = section.cell;
                    const whatFollowsTheSection =
                        sections[sectionIndex + 1]?.cell.uniqueId ??
                        whatFollowsTheScope;
                    const cellDrawn = cell.accept<ReactNode>(cellRenderer);
                    if (cellDrawn === null) {
                        return null;
                    }
                    return (
                        <li
                            key={cell.uniqueId}
                            data-cell-id={cell.uniqueId}
                            className={
                                cell.folded
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
                                cellId={cell.uniqueId}
                                cellIsFolded={cell.folded}
                                timesTheHostWroteIt={
                                    timesTheHostWroteEachCell[cell.uniqueId] ??
                                    0
                                }
                                proseErrors={proseErrors.filter(
                                    (proseError) =>
                                        proseError.cellId === cell.uniqueId &&
                                        proseError.isVisible,
                                )}
                                storyTextHighlights={storyTextHighlightsByCellId.get(
                                    cell.uniqueId,
                                )}
                                storyTextShown={
                                    storyTextShown?.cellId === cell.uniqueId
                                        ? storyTextShown
                                        : undefined
                                }
                                onStoryTextClicked={(clickedAt) =>
                                    selectThePassagesClicked(
                                        cell.uniqueId,
                                        clickedAt,
                                    )
                                }
                                onStoryTextShownAt={bringTheStoryTextIntoView}
                                findMatches={findMatchesByCellId.get(
                                    cell.uniqueId,
                                )}
                                currentFindMatch={
                                    find.current?.cellId === cell.uniqueId
                                        ? find.current
                                        : null
                                }
                                howFarTheCellHasBeenWritten={
                                    cellsBeingWritten[cell.uniqueId]
                                }
                                wordsInTheSection={
                                    wordsInEverySection[cell.uniqueId]
                                }
                                onStoryTextSelected={(
                                    selectedFrom,
                                    selectedTo,
                                ) =>
                                    sendMessagesToVscode({
                                        type: "storyTextSelected",
                                        storyTextSelected:
                                            selectedFrom === selectedTo
                                                ? null
                                                : {
                                                      cellId: cell.uniqueId,
                                                      startCharacterOffsetInCell:
                                                          selectedFrom,
                                                      endCharacterOffsetInCell:
                                                          selectedTo,
                                                  },
                                    })
                                }
                                sendMessagesToVscode={sendMessagesToVscode}
                            >
                                {cellDrawn}
                            </AuthorFileEditorCellState>
                            {opensASection(cell.kind) && !cell.folded
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
            <MarkdownEditorMediator
                onEditingTheCell={(cellId) =>
                    sendMessagesToVscode({ type: "editing", cellId })
                }
            >
                {cellsInScope(sections, null)}
                <AuthorFileEditorOverviewRuler
                    scrolledList={cellsOnThePage}
                    marks={whatTheOverviewRulerShows.marks}
                    arrows={whatTheOverviewRulerShows.arrows}
                />
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
