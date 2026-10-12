import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import * as monaco from "monaco-editor/editor/editor.api";
import {
    conf as markdownConfiguration,
    language as markdownLanguage,
} from "monaco-editor/languages/definitions/markdown/markdown.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import { marked } from "marked";
import {
    fenced,
    markedUp,
    unfenced,
} from "../author_editor/AuthorFileEditorFind";
import type { AuthorFileEditorFindHighlight } from "../author_editor/AuthorFileEditorFind";
import { LinterTooltip } from "../linter/LinterTooltip";
import type { ProseCheckError } from "../../vscode_runtime/commands/check_prose";
import type { ParagraphInStoryPlots } from "../../vscode_runtime/commands/identify_story_plots";
import {
    storyWordSpansIn,
    type StoryWordSpan,
} from "../../vscode_runtime/storydoc/story_words";
import "./MarkdownEditor.css";

monaco.languages.register({ id: "markdown" });
monaco.languages.setLanguageConfiguration("markdown", markdownConfiguration);
monaco.languages.setMonarchTokensProvider("markdown", markdownLanguage);

monaco.editor.addKeybindingRules([
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, command: null },
    {
        keybinding:
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
        command: null,
    },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, command: null },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, command: null },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, command: null },
    {
        keybinding:
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
        command: null,
    },
    { keybinding: monaco.KeyCode.F3, command: null },
    { keybinding: monaco.KeyMod.Shift | monaco.KeyCode.F3, command: null },
]);

const HOLD_TOOLTIP_MS = 200;
const MONACO_THEME_FROM_VSCODE = "author-file-editor";
const STORY_PLOT_COLORS_THE_STYLESHEET_DEFINES = 6;
const MONACO_STOPS_WRAPPING_THIS_FAR_BEFORE_ITS_VERTICAL_SCROLLBAR_PX = 2;
const MARKDOWN_WORDS_A_RENDERED_WORD_MAY_SKIP = 8;

export interface MarkdownEditorSalientConceptHighlight {
    startCharacterOffsetInCell: number;
    endCharacterOffsetInCell: number;
    salientConceptColor: number;
}

const NO_SALIENT_CONCEPT_HIGHLIGHTS: MarkdownEditorSalientConceptHighlight[] =
    [];

export interface MarkdownEditorStoryTextShown {
    startCharacterOffsetInCell: number;
    endCharacterOffsetInCell: number;
}

export function storyPlotColorClassName(storyPlotIndex: number): string {
    return `markdown-editor-story-plot-${storyPlotIndex % STORY_PLOT_COLORS_THE_STYLESHEET_DEFINES}`;
}

interface MarkdownEditorBeingEdited {
    editorBeingEdited: string | null;
    editMarkdownEditor: (editorId: string | null) => void;
}

const MarkdownEditorBeingEditedContext =
    createContext<MarkdownEditorBeingEdited | null>(null);

export function MarkdownEditorMediator({
    children,
    onEditingTheCell,
}: {
    children: ReactNode;
    onEditingTheCell: (cellId: string | null) => void;
}) {
    const [editorBeingEdited, editMarkdownEditor] = useState<string | null>(
        null,
    );
    const sayWhichCellIsBeingEdited = useRef(onEditingTheCell);
    sayWhichCellIsBeingEdited.current = onEditingTheCell;
    const theCellTheHostWasTold = useRef<string | null>(null);

    useEffect(() => {
        if (theCellTheHostWasTold.current === editorBeingEdited) {
            return;
        }
        theCellTheHostWasTold.current = editorBeingEdited;
        sayWhichCellIsBeingEdited.current(editorBeingEdited);
    }, [editorBeingEdited]);

    return (
        <MarkdownEditorBeingEditedContext.Provider
            value={{ editorBeingEdited, editMarkdownEditor }}
        >
            {children}
        </MarkdownEditorBeingEditedContext.Provider>
    );
}

function useMarkdownEditorBeingEdited(editorId: string) {
    const mediator = useContext(MarkdownEditorBeingEditedContext);
    if (!mediator) {
        throw new Error(
            "A MarkdownEditor can only be rendered inside a MarkdownEditorMediator.",
        );
    }
    return {
        isEditing: mediator.editorBeingEdited === editorId,
        beginEditing: () => mediator.editMarkdownEditor(editorId),
        finishEditing: () => mediator.editMarkdownEditor(null),
    };
}

interface MarkdownEditorProps {
    cellId: string;
    markdown: string;
    timesTheHostWroteIt?: number;
    onMarkdownCommitted: (markdown: string) => void;
    errors?: ProseCheckError[];
    highlights?: AuthorFileEditorFindHighlight[];
    paragraphsInStoryPlots?: ParagraphInStoryPlots[];
    salientConceptHighlights?: MarkdownEditorSalientConceptHighlight[];
    storyTextShown?: MarkdownEditorStoryTextShown;
    onFixAsked?: (error: ProseCheckError) => void;
    onTextSelected?: (selectedFrom: number, selectedTo: number) => void;
    onStoryTextShownAt?: (top: number, bottom: number) => void;
    children?: (markdown: string) => ReactNode;
}

export function MarkdownEditor({
    cellId,
    markdown,
    timesTheHostWroteIt = 0,
    onMarkdownCommitted,
    errors = [],
    highlights = [],
    paragraphsInStoryPlots = [],
    salientConceptHighlights = NO_SALIENT_CONCEPT_HIGHLIGHTS,
    storyTextShown,
    onFixAsked = () => undefined,
    onTextSelected,
    onStoryTextShownAt = () => undefined,
    children,
}: MarkdownEditorProps) {
    const { isEditing, beginEditing, finishEditing } =
        useMarkdownEditorBeingEdited(cellId);
    const [markdownShown, showMarkdown] = useState(markdown);
    const renderedMarkdown = useRef<HTMLDivElement>(null);
    const textSelectedNow = useRef(onTextSelected);
    textSelectedNow.current = onTextSelected;
    const storyTextShownAtNow = useRef(onStoryTextShownAt);
    storyTextShownAtNow.current = onStoryTextShownAt;

    useEffect(() => {
        showMarkdown(markdown);
    }, [markdown, timesTheHostWroteIt]);

    useEffect(() => {
        if (isEditing || children || !textSelectedNow.current) {
            return;
        }
        const selectionChanged = (): void => {
            const rendered = renderedMarkdown.current;
            const selection = document.getSelection();
            if (!rendered || !selection || selection.rangeCount === 0) {
                return;
            }
            const selected = selection.getRangeAt(0);
            if (
                !rendered.contains(selected.startContainer) ||
                !rendered.contains(selected.endContainer)
            ) {
                return;
            }
            if (selected.collapsed) {
                textSelectedNow.current?.(0, 0);
                return;
            }
            const inTheMarkdown = whereTheRenderedSelectionStandsInTheMarkdown(
                markdownShown,
                rendered,
                selected,
            );
            textSelectedNow.current?.(inTheMarkdown.from, inTheMarkdown.to);
        };
        document.addEventListener("selectionchange", selectionChanged);
        return () =>
            document.removeEventListener("selectionchange", selectionChanged);
    }, [isEditing, children, markdownShown]);

    const renderedHtml =
        isEditing || children
            ? ""
            : markedUp(
                  renderedWithStoryPlotBorders(
                      fenced(markdownShown, highlights),
                      paragraphsInStoryPlots,
                  ),
              );
    const renderedHtmlThatKeepsTheSelection = useMemo(
        () => ({ __html: renderedHtml }),
        [renderedHtml],
    );

    useEffect(() => {
        const rendered = renderedMarkdown.current;
        if (!storyTextShown || isEditing || !rendered) {
            return;
        }
        const wordsShown =
            renderedRangeOfTheMarkdown(
                markdownShown,
                rendered,
                storyTextShown.startCharacterOffsetInCell,
                storyTextShown.endCharacterOffsetInCell,
            ) ?? rendered;
        const drawnAt = wordsShown.getBoundingClientRect();
        storyTextShownAtNow.current(drawnAt.top, drawnAt.bottom);
    }, [storyTextShown]);

    useEffect(() => {
        const rendered = renderedMarkdown.current;
        if (
            isEditing ||
            children ||
            !rendered ||
            salientConceptHighlights.length === 0 ||
            typeof Highlight === "undefined"
        ) {
            return;
        }
        const drawn = salientConceptHighlights.flatMap((highlighted) => {
            const range = renderedRangeOfTheMarkdown(
                markdownShown,
                rendered,
                highlighted.startCharacterOffsetInCell,
                highlighted.endCharacterOffsetInCell,
            );
            return range
                ? [
                      {
                          highlight: salientConceptHighlightOfColor(
                              highlighted.salientConceptColor,
                          ),
                          range,
                      },
                  ]
                : [];
        });
        for (const { highlight, range } of drawn) {
            highlight.add(range);
        }
        return () => {
            for (const { highlight, range } of drawn) {
                highlight.delete(range);
            }
        };
    }, [
        isEditing,
        children,
        markdownShown,
        renderedHtml,
        salientConceptHighlights,
    ]);

    if (!isEditing && children) {
        return (
            <div className="markdown-rendered" onDoubleClick={beginEditing}>
                {children(fenced(markdownShown, highlights))}
            </div>
        );
    }

    if (!isEditing) {
        return (
            <div
                className="markdown-rendered"
                ref={renderedMarkdown}
                onDoubleClick={beginEditing}
                dangerouslySetInnerHTML={renderedHtmlThatKeepsTheSelection}
            />
        );
    }

    return (
        <MonacoMarkdownEditor
            markdown={markdownShown}
            errors={errors}
            highlights={highlights}
            paragraphsInStoryPlots={paragraphsInStoryPlots}
            salientConceptHighlights={salientConceptHighlights}
            storyTextShown={storyTextShown}
            onFixAsked={onFixAsked}
            onTextSelected={onTextSelected ?? (() => undefined)}
            onStoryTextShownAt={onStoryTextShownAt}
            onMarkdownChanged={(typed) => {
                showMarkdown(typed);
                onMarkdownCommitted(typed);
            }}
            onFinished={finishEditing}
        />
    );
}

function renderedCharactersBefore(
    rendered: HTMLElement,
    node: Node,
    offset: number,
): number {
    const before = document.createRange();
    before.setStart(rendered, 0);
    before.setEnd(node, offset);
    return before.toString().length;
}

function lettersAndDigitsOf(word: string): string {
    return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function markdownWordOfEachRenderedWord(
    renderedWords: StoryWordSpan[],
    markdownWords: StoryWordSpan[],
): (number | null)[] {
    let nextMarkdownWord = 0;
    return renderedWords.map((renderedWord) => {
        const wanted = lettersAndDigitsOf(renderedWord.text);
        const lookedAsFarAs = Math.min(
            markdownWords.length,
            nextMarkdownWord + MARKDOWN_WORDS_A_RENDERED_WORD_MAY_SKIP,
        );
        for (
            let looked = nextMarkdownWord;
            looked < lookedAsFarAs;
            looked += 1
        ) {
            if (lettersAndDigitsOf(markdownWords[looked].text) === wanted) {
                nextMarkdownWord = looked + 1;
                return looked;
            }
        }
        return null;
    });
}

function salientConceptHighlightOfColor(salientConceptColor: number): Highlight {
    const highlightName = `markdown-editor-salient-concept-${salientConceptColor % STORY_PLOT_COLORS_THE_STYLESHEET_DEFINES}`;
    const registered = CSS.highlights.get(highlightName);
    if (registered) {
        return registered;
    }
    const highlight = new Highlight();
    CSS.highlights.set(highlightName, highlight);
    return highlight;
}

function renderedPositionOf(
    rendered: HTMLElement,
    renderedOffset: number,
): { node: Node; offset: number } | null {
    const walking = document.createTreeWalker(rendered, NodeFilter.SHOW_TEXT);
    let charactersPassed = 0;
    while (walking.nextNode()) {
        const text = walking.currentNode as Text;
        if (renderedOffset <= charactersPassed + text.data.length) {
            return { node: text, offset: renderedOffset - charactersPassed };
        }
        charactersPassed += text.data.length;
    }
    return null;
}

function renderedRangeOfTheMarkdown(
    markdown: string,
    rendered: HTMLElement,
    from: number,
    to: number,
): Range | null {
    const markdownWords = storyWordSpansIn(markdown);
    const renderedWords = storyWordSpansIn(rendered.textContent ?? "");
    const markdownWordOfEach = markdownWordOfEachRenderedWord(
        renderedWords,
        markdownWords,
    );
    const renderedWordsCovered = renderedWords.filter(
        (_renderedWord, renderedWordIndex) => {
            const markdownWord = markdownWordOfEach[renderedWordIndex];
            return (
                markdownWord !== null &&
                markdownWords[markdownWord].startCharacterOffsetInCell < to &&
                from < markdownWords[markdownWord].endCharacterOffsetInCell
            );
        },
    );
    if (renderedWordsCovered.length === 0) {
        return null;
    }
    const startsAt = renderedPositionOf(
        rendered,
        renderedWordsCovered[0].startCharacterOffsetInCell,
    );
    const endsAt = renderedPositionOf(
        rendered,
        renderedWordsCovered[renderedWordsCovered.length - 1]
            .endCharacterOffsetInCell,
    );
    if (!startsAt || !endsAt) {
        return null;
    }
    const range = document.createRange();
    range.setStart(startsAt.node, startsAt.offset);
    range.setEnd(endsAt.node, endsAt.offset);
    return range;
}

function whereTheRenderedSelectionStandsInTheMarkdown(
    markdown: string,
    rendered: HTMLElement,
    selected: Range,
): { from: number; to: number } {
    const selectedFrom = renderedCharactersBefore(
        rendered,
        selected.startContainer,
        selected.startOffset,
    );
    const selectedTo = renderedCharactersBefore(
        rendered,
        selected.endContainer,
        selected.endOffset,
    );
    const markdownWords = storyWordSpansIn(markdown);
    const renderedWords = storyWordSpansIn(rendered.textContent ?? "");
    const markdownWordOfEach = markdownWordOfEachRenderedWord(
        renderedWords,
        markdownWords,
    );
    const markdownWordsSelected = renderedWords
        .map((renderedWord, renderedWordIndex) => ({
            renderedWord,
            markdownWord: markdownWordOfEach[renderedWordIndex],
        }))
        .filter(
            ({ renderedWord, markdownWord }) =>
                markdownWord !== null &&
                renderedWord.startCharacterOffsetInCell < selectedTo &&
                selectedFrom < renderedWord.endCharacterOffsetInCell,
        )
        .map(({ markdownWord }) => markdownWord as number);
    if (markdownWordsSelected.length === 0) {
        return { from: 0, to: 0 };
    }
    return {
        from: markdownWords[Math.min(...markdownWordsSelected)]
            .startCharacterOffsetInCell,
        to: markdownWords[Math.max(...markdownWordsSelected)]
            .endCharacterOffsetInCell,
    };
}

function storyPlotColorClassNamesOf(
    paragraphsInStoryPlots: ParagraphInStoryPlots[],
): string[] {
    return [
        ...new Set(
            paragraphsInStoryPlots.flatMap((paragraph) =>
                paragraph.storyPlotIndices.map(storyPlotColorClassName),
            ),
        ),
    ];
}

function renderedWithStoryPlotBorders(
    fencedMarkdown: string,
    paragraphsInStoryPlots: ParagraphInStoryPlots[],
): string {
    let html = "";
    let blockStartsAt = 0;
    for (const block of marked.lexer(fencedMarkdown, { gfm: true })) {
        const blockEndsAt = blockStartsAt + unfenced(block.raw).length;
        const blockHtml = marked.parser([block]);
        const colorClassNames = storyPlotColorClassNamesOf(
            paragraphsInStoryPlots.filter(
                (paragraph) =>
                    paragraph.startCharacterOffsetInCell < blockEndsAt &&
                    blockStartsAt < paragraph.endCharacterOffsetInCell,
            ),
        );
        blockStartsAt = blockEndsAt;
        html +=
            blockHtml && colorClassNames.length > 0
                ? `<div class="markdown-rendered-paragraph-in-story-plots">${blockHtml}${colorClassNames
                      .map(
                          (colorClassName) =>
                              `<span class="markdown-editor-story-plot-border ${colorClassName}"></span>`,
                      )
                      .join("")}</div>`
                : blockHtml;
    }
    return html;
}

const NEIGHBOURHOOD_AROUND_THE_CURSOR = 40;

function whereTheCursorStandsInTheNewText(
    shown: string,
    wanted: string,
    stoodAt: number,
): number {
    if (shown.length === wanted.length) {
        return stoodAt;
    }
    const wouldStandAt = Math.min(
        wanted.length,
        Math.round((stoodAt * wanted.length) / (shown.length || 1)),
    );
    const neighbourhood = shown.slice(
        Math.max(0, stoodAt - NEIGHBOURHOOD_AROUND_THE_CURSOR),
        stoodAt,
    );
    const neighbourhoodEndsAt = whereTheNeighbourhoodEndsNow(
        wanted,
        neighbourhood,
        wouldStandAt,
    );
    return neighbourhoodEndsAt < 0 ? wouldStandAt : neighbourhoodEndsAt;
}

function whereTheNeighbourhoodEndsNow(
    wanted: string,
    neighbourhood: string,
    wouldStandAt: number,
): number {
    if (!neighbourhood) {
        return -1;
    }
    const before = wanted.lastIndexOf(neighbourhood, wouldStandAt);
    const after = wanted.indexOf(neighbourhood, wouldStandAt);
    if (before < 0 && after < 0) {
        return -1;
    }
    if (before < 0) {
        return after + neighbourhood.length;
    }
    if (after < 0) {
        return before + neighbourhood.length;
    }
    return Math.abs(before + neighbourhood.length - wouldStandAt) <=
        Math.abs(after + neighbourhood.length - wouldStandAt)
        ? before + neighbourhood.length
        : after + neighbourhood.length;
}

interface MonacoMarkdownEditorProps {
    markdown: string;
    errors: ProseCheckError[];
    highlights: AuthorFileEditorFindHighlight[];
    paragraphsInStoryPlots: ParagraphInStoryPlots[];
    salientConceptHighlights: MarkdownEditorSalientConceptHighlight[];
    storyTextShown?: MarkdownEditorStoryTextShown;
    onFixAsked: (error: ProseCheckError) => void;
    onTextSelected: (selectedFrom: number, selectedTo: number) => void;
    onStoryTextShownAt: (top: number, bottom: number) => void;
    onMarkdownChanged: (markdown: string) => void;
    onFinished: () => void;
}

interface MarkdownEditorErrorUnderPointer {
    error: ProseCheckError;
    top: number;
    left: number;
}

function MonacoMarkdownEditor({
    markdown,
    errors,
    highlights,
    paragraphsInStoryPlots,
    salientConceptHighlights,
    storyTextShown,
    onFixAsked,
    onTextSelected,
    onStoryTextShownAt,
    onMarkdownChanged,
    onFinished,
}: MonacoMarkdownEditorProps) {
    const editorHost = useRef<HTMLDivElement>(null);
    const monacoEditor = useRef<monaco.editor.IStandaloneCodeEditor | null>(
        null,
    );
    const drawnMarks =
        useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
    const drawnHighlights =
        useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
    const drawnStoryPlotBorders =
        useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
    const drawnSalientConceptHighlights =
        useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
    const errorsNow = useRef(errors);
    errorsNow.current = errors;
    const [errorUnderPointer, sayErrorUnderPointer] =
        useState<MarkdownEditorErrorUnderPointer | null>(null);
    const hidingTheTooltip = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    const pointerIsOnTheTooltip = useRef(false);
    const latestCallbacks = useRef({
        onMarkdownChanged,
        onFinished,
        onTextSelected,
        onStoryTextShownAt,
    });
    latestCallbacks.current = {
        onMarkdownChanged,
        onFinished,
        onTextSelected,
        onStoryTextShownAt,
    };

    useEffect(() => {
        const node = editorHost.current;
        if (!node) {
            return;
        }
        const styleOfThePage = getComputedStyle(document.body);
        const editorForeground = styleOfThePage
            .getPropertyValue("--vscode-editor-foreground")
            .trim()
            .replace("#", "");
        monaco.editor.defineTheme(MONACO_THEME_FROM_VSCODE, {
            base: document.body.classList.contains("vscode-light")
                ? "vs"
                : "vs-dark",
            inherit: true,
            rules: editorForeground
                ? [{ token: "", foreground: editorForeground }]
                : [],
            colors: { "editor.background": "#00000000" },
        });
        const editor = monaco.editor.create(node, {
            value: markdown,
            language: "markdown",
            theme: MONACO_THEME_FROM_VSCODE,
            editContext: false,
            automaticLayout: true,
            fontFamily:
                styleOfThePage
                    .getPropertyValue("--vscode-editor-font-family")
                    .trim() || undefined,
            fontSize:
                parseFloat(
                    styleOfThePage.getPropertyValue(
                        "--vscode-editor-font-size",
                    ),
                ) || undefined,
            fontWeight:
                styleOfThePage
                    .getPropertyValue("--vscode-editor-font-weight")
                    .trim() || undefined,
            lineHeight:
                parseFloat(
                    styleOfThePage.getPropertyValue(
                        "--markdown-editor-line-height-to-font-size",
                    ),
                ) || undefined,
            wordWrap: "on",
            lineNumbers: "off",
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 0,
            minimap: { enabled: false },
            overviewRulerLanes: 0,
            renderLineHighlight: "none",
            scrollBeyondLastLine: false,
            scrollbar: {
                vertical: "hidden",
                horizontal: "hidden",
                verticalScrollbarSize:
                    parseFloat(
                        styleOfThePage.getPropertyValue(
                            "--markdown-editor-story-plot-gutter",
                        ),
                    ) -
                        MONACO_STOPS_WRAPPING_THIS_FAR_BEFORE_ITS_VERTICAL_SCROLLBAR_PX ||
                    undefined,
                alwaysConsumeMouseWheel: false,
                useShadows: false,
            },
            wordBasedSuggestions: "off",
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            links: false,
            occurrencesHighlight: "off",
            codeLens: false,
            contextmenu: false,
        });

        const fitToContent = (): void => {
            node.style.height = `${editor.getContentHeight()}px`;
            editor.layout();
        };

        drawnMarks.current = editor.createDecorationsCollection([]);
        drawnHighlights.current = editor.createDecorationsCollection([]);
        drawnStoryPlotBorders.current = editor.createDecorationsCollection([]);
        drawnSalientConceptHighlights.current =
            editor.createDecorationsCollection([]);

        const errorUnderPointer = (
            event: monaco.editor.IEditorMouseEvent,
        ): MarkdownEditorErrorUnderPointer | null => {
            const model = editor.getModel();
            const position = event.target.position;
            if (!model || !position) {
                return null;
            }
            const offset = model.getOffsetAt(position);
            const error = errorsNow.current.find(
                (marked) =>
                    offset >= marked.startCharacterOffsetInCell &&
                    offset <= marked.endCharacterOffsetInCell,
            );
            const wordsDrawnAt =
                error && editor.getScrolledVisiblePosition(position);
            if (!error || !wordsDrawnAt) {
                return null;
            }
            const editorBox = node.getBoundingClientRect();
            return {
                error,
                top: editorBox.top + wordsDrawnAt.top + wordsDrawnAt.height,
                left: editorBox.left + wordsDrawnAt.left,
            };
        };

        const contentResized = editor.onDidContentSizeChange(fitToContent);
        const hideTheTooltipUnlessItIsPointedAt = (): void => {
            clearTimeout(hidingTheTooltip.current);
            hidingTheTooltip.current = setTimeout(() => {
                if (!pointerIsOnTheTooltip.current) {
                    sayErrorUnderPointer(null);
                }
            }, HOLD_TOOLTIP_MS);
        };
        const pointerMoved = editor.onMouseMove((event) => {
            const underPointer = errorUnderPointer(event);
            if (underPointer) {
                clearTimeout(hidingTheTooltip.current);
                sayErrorUnderPointer(underPointer);
            } else {
                hideTheTooltipUnlessItIsPointedAt();
            }
        });
        const pointerLeft = editor.onMouseLeave(
            hideTheTooltipUnlessItIsPointedAt,
        );
        const contentChanged = editor.onDidChangeModelContent((changed) => {
            if (changed.isFlush) {
                return;
            }
            latestCallbacks.current.onMarkdownChanged(editor.getValue());
        });
        const selectionChanged = editor.onDidChangeCursorSelection(
            (changed) => {
                const model = editor.getModel();
                if (!model) {
                    return;
                }
                latestCallbacks.current.onTextSelected(
                    model.getOffsetAt(changed.selection.getStartPosition()),
                    model.getOffsetAt(changed.selection.getEndPosition()),
                );
            },
        );
        const escapePressed = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                latestCallbacks.current.onFinished();
            }
        };
        window.addEventListener("keydown", escapePressed, true);
        monacoEditor.current = editor;

        fitToContent();
        editor.focus();

        return () => {
            monacoEditor.current = null;
            window.removeEventListener("keydown", escapePressed, true);
            clearTimeout(hidingTheTooltip.current);
            contentResized.dispose();
            pointerMoved.dispose();
            pointerLeft.dispose();
            contentChanged.dispose();
            selectionChanged.dispose();
            editor.dispose();
        };
    }, []);

    useEffect(() => {
        const editor = monacoEditor.current;
        const model = editor?.getModel();
        if (!editor || !model || editor.getValue() === markdown) {
            return;
        }
        const shown = editor.getValue();
        const position = editor.getPosition();
        const stoodAt = position ? model.getOffsetAt(position) : 0;
        editor.setValue(markdown);
        editor.setPosition(
            model.getPositionAt(
                whereTheCursorStandsInTheNewText(shown, markdown, stoodAt),
            ),
        );
    }, [markdown]);

    useEffect(() => {
        const editor = monacoEditor.current;
        if (editor && editor.getValue() !== markdown) {
            editor.setValue(markdown);
        }
    }, [markdown]);

    useEffect(() => {
        const model = monacoEditor.current?.getModel();
        if (!model) {
            return;
        }
        drawnMarks.current?.set(
            errors.map((error) => ({
                range: monaco.Range.fromPositions(
                    model.getPositionAt(error.startCharacterOffsetInCell),
                    model.getPositionAt(error.endCharacterOffsetInCell),
                ),
                options: {
                    inlineClassName: `markdown-editor-mark markdown-editor-mark-${error.isAnErrorOf}`,
                },
            })),
        );
    }, [errors, markdown]);

    // A cell open for typing shows no HTML, so its matches are marked by the
    // text editor instead — in the same colours the rest of the page marks them,
    // so that stepping from one to the next does not change what a match looks
    // like halfway through the document.
    useEffect(() => {
        const model = monacoEditor.current?.getModel();
        if (!model) {
            return;
        }
        drawnHighlights.current?.set(
            highlights.map((highlight) => ({
                range: monaco.Range.fromPositions(
                    model.getPositionAt(highlight.at),
                    model.getPositionAt(highlight.end),
                ),
                options: {
                    inlineClassName: highlight.isCurrent
                        ? "author-file-editor-find-match author-file-editor-find-match-current"
                        : "author-file-editor-find-match",
                },
            })),
        );
    }, [highlights, markdown]);

    useEffect(() => {
        const model = monacoEditor.current?.getModel();
        if (!model) {
            return;
        }
        drawnStoryPlotBorders.current?.set(
            paragraphsInStoryPlots.flatMap((paragraph) =>
                storyPlotColorClassNamesOf([paragraph]).map(
                    (colorClassName) => ({
                        range: monaco.Range.fromPositions(
                            model.getPositionAt(
                                paragraph.startCharacterOffsetInCell,
                            ),
                            model.getPositionAt(
                                paragraph.endCharacterOffsetInCell,
                            ),
                        ),
                        options: {
                            isWholeLine: true,
                            className: `markdown-editor-story-plot-border ${colorClassName}`,
                        },
                    }),
                ),
            ),
        );
    }, [paragraphsInStoryPlots, markdown]);

    useEffect(() => {
        const model = monacoEditor.current?.getModel();
        if (!model) {
            return;
        }
        drawnSalientConceptHighlights.current?.set(
            salientConceptHighlights.map((highlighted) => ({
                range: monaco.Range.fromPositions(
                    model.getPositionAt(highlighted.startCharacterOffsetInCell),
                    model.getPositionAt(highlighted.endCharacterOffsetInCell),
                ),
                options: {
                    inlineClassName: `markdown-editor-salient-concept ${storyPlotColorClassName(highlighted.salientConceptColor)}`,
                },
            })),
        );
    }, [salientConceptHighlights, markdown]);

    useEffect(() => {
        const editor = monacoEditor.current;
        const model = editor?.getModel();
        const host = editorHost.current;
        if (!storyTextShown || !editor || !model || !host) {
            return;
        }
        const wordsDrawnAt = editor.getScrolledVisiblePosition(
            model.getPositionAt(storyTextShown.startCharacterOffsetInCell),
        );
        if (!wordsDrawnAt) {
            return;
        }
        const editorTop = host.getBoundingClientRect().top;
        latestCallbacks.current.onStoryTextShownAt(
            editorTop + wordsDrawnAt.top,
            editorTop + wordsDrawnAt.top + wordsDrawnAt.height,
        );
    }, [storyTextShown]);

    return (
        <>
            <div className="markdown-editor" ref={editorHost} />
            {errorUnderPointer &&
                createPortal(
                    <div
                        className="markdown-editor-mark-said"
                        style={{
                            top: errorUnderPointer.top,
                            left: errorUnderPointer.left,
                        }}
                        onMouseEnter={() => {
                            pointerIsOnTheTooltip.current = true;
                            clearTimeout(hidingTheTooltip.current);
                        }}
                        onMouseLeave={() => {
                            pointerIsOnTheTooltip.current = false;
                            sayErrorUnderPointer(null);
                        }}
                    >
                        <LinterTooltip
                            errors={[errorUnderPointer.error]}
                            onFixAsked={onFixAsked}
                        />
                    </div>,
                    document.body,
                )}
        </>
    );
}
