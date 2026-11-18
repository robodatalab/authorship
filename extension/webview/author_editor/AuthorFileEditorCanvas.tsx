import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AuthorFileEditorMainMenu } from "./AuthorFileEditorMainMenu";
import { AuthorFileEditorPartAndChapterInView } from "./AuthorFileEditorPartAndChapterInView";
import { AuthorFileEditorStoryGeneration } from "./AuthorFileEditorStoryGeneration";
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
import type { StoryGeneration } from "../../vscode_runtime/story_generation";
import type { Cell } from "authordoc/cells/cell";
import type { CellVisitor } from "authordoc/cells/cell_visitor";
import { CHARACTER } from "authordoc/cells/character_cell";
import { PART } from "authordoc/cells/part_cell";
import { PLACE } from "authordoc/cells/place_cell";
import { PLOT } from "authordoc/cells/plot_cell";
import { SALIENT_CONCEPT } from "authordoc/cells/salient_concept_cell";
import { StoryAnnotationsIterator } from "authordoc/iterators/story_annotations_iterator";
import {
    StoryWordsIterator,
    type StoryTextSpan,
} from "authordoc/iterators/story_words_iterator";
import {
    cellsBySection,
    opensASection,
    type CellsInASection,
} from "authordoc/story_sections";
import { Document } from "authordoc/storydoc";
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
const NARROWEST_PANE_PX = 160;

const MANUSCRIPT_PANE = "Manuscript";
const METADATA_PANE = "Metadata";
const KINDS_IN_THE_METADATA_PANE = new Set([
    PLOT,
    SALIENT_CONCEPT,
    CHARACTER,
    PLACE,
]);

function paneHoldingTheKind(kind: string): string {
    return KINDS_IN_THE_METADATA_PANE.has(kind)
        ? METADATA_PANE
        : MANUSCRIPT_PANE;
}

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
    storyGeneration?: StoryGeneration | null;
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
    storyGeneration = null,
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
            // The marks are the plot's passages, and only an event the story
            // tells has one, so an edge is drawn between the events' passages.
            const nodeSelected = annotation.passageIds[passageSelected];
            for (const edge of plotCell.edges) {
                const fromPassage = annotation.passageIds.indexOf(
                    edge.fromNodeId,
                );
                const toPassage = annotation.passageIds.indexOf(edge.toNodeId);
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
    const canvasDrawn = useRef<HTMLDivElement>(null);
    const [metadataPaneWidth, resizeTheMetadataPane] = useState<
        number | null
    >(null);
    const columnsOfThePanesResized =
        metadataPaneWidth === null
            ? undefined
            : `${metadataPaneWidth}px auto minmax(0, 1fr) auto`;

    function resizeThePanesAsTheSplitterIsDragged(
        pressed: ReactPointerEvent<HTMLDivElement>,
    ): void {
        const canvas = canvasDrawn.current;
        if (!canvas) {
            return;
        }
        pressed.preventDefault();
        const canvasDrawnAt = canvas.getBoundingClientRect();
        const widest = canvasDrawnAt.width - NARROWEST_PANE_PX;
        const followThePointer = (moved: PointerEvent): void => {
            const reached = moved.clientX - canvasDrawnAt.left;
            const notNarrower = Math.max(reached, NARROWEST_PANE_PX);
            const width = Math.min(notNarrower, widest);
            resizeTheMetadataPane(width);
        };
        const letGo = (): void => {
            document.removeEventListener("pointermove", followThePointer);
            document.removeEventListener("pointerup", letGo);
        };
        document.addEventListener("pointermove", followThePointer);
        document.addEventListener("pointerup", letGo);
    }
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

    function insertCellMenu(
        insertBeforeCellId: string | null,
        pane: string,
    ): ReactNode {
        const cellTypesInThePane = cellTypes.filter(
            (cellType) => paneHoldingTheKind(cellType.cellKind) === pane,
        );
        if (cellTypesInThePane.length === 0) {
            return null;
        }
        return (
            <AuthorFileEditorInsertCellMenu
                insertCommand={insertCommand}
                cellTypes={cellTypesInThePane}
                insertBeforeCellId={insertBeforeCellId}
                sendMessagesToVscode={sendMessagesToVscode}
            />
        );
    }

    function cellsInScope(
        sections: CellsInASection<Cell>[],
        whatFollowsTheScope: string | null,
        pane: string,
        scopeClassName?: string,
    ): ReactNode {
        const sectionsInThePane = sections.filter(
            (section) => paneHoldingTheKind(section.cell.kind) === pane,
        );
        const scrolledByTheRuler =
            scopeClassName === undefined && pane === MANUSCRIPT_PANE;
        return (
            <ul
                className={scopeClassName}
                ref={scrolledByTheRuler ? cellsOnThePage : undefined}
            >
                <li>
                    {insertCellMenu(
                        sectionsInThePane[0]?.cell.uniqueId ??
                            whatFollowsTheScope,
                        pane,
                    )}
                </li>
                {sections.map((section, sectionIndex) => {
                    const cell = section.cell;
                    const whatFollowsTheSection =
                        sections[sectionIndex + 1]?.cell.uniqueId ??
                        whatFollowsTheScope;
                    if (!sectionsInThePane.includes(section)) {
                        return null;
                    }
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
                                      pane,
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
                                : insertCellMenu(whatFollowsTheSection, pane)}
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <div
            className="author-file-editor-canvas"
            ref={canvasDrawn}
            style={{ gridTemplateColumns: columnsOfThePanesResized }}
        >
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
                <AuthorFileEditorStoryGeneration
                    storyGeneration={storyGeneration}
                    sendMessagesToVscode={sendMessagesToVscode}
                />
            </AuthorFileEditorMainMenu>
            <MarkdownEditorMediator
                onEditingTheCell={(cellId) =>
                    sendMessagesToVscode({ type: "editing", cellId })
                }
            >
                <section
                    className="author-file-editor-pane author-file-editor-metadata-pane"
                    aria-label={METADATA_PANE}
                >
                    <h2 className="author-file-editor-pane-title">
                        {METADATA_PANE}
                    </h2>
                    {cellsInScope(sections, null, METADATA_PANE)}
                </section>
                <div
                    className="author-file-editor-pane-splitter"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Drag to resize the metadata and manuscript panes"
                    onPointerDown={resizeThePanesAsTheSplitterIsDragged}
                />
                <section
                    className="author-file-editor-pane author-file-editor-manuscript-pane"
                    aria-label={MANUSCRIPT_PANE}
                >
                    <h2 className="author-file-editor-pane-title">
                        {MANUSCRIPT_PANE}
                    </h2>
                    {cellsInScope(sections, null, MANUSCRIPT_PANE)}
                </section>
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
