import {
    createContext,
    useContext,
    useEffect,
    useId,
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
import { fenced, markedUp } from "../author_editor/AuthorFileEditorFind";
import type { AuthorFileEditorFindHighlight } from "../author_editor/AuthorFileEditorFind";
import { LinterTooltip } from "../linter/LinterTooltip";
import type { ProseCheckError } from "../../vscode_runtime/commands/check_prose";
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

interface MarkdownEditorBeingEdited {
    editorBeingEdited: string | null;
    editMarkdownEditor: (editorId: string | null) => void;
}

const MarkdownEditorBeingEditedContext =
    createContext<MarkdownEditorBeingEdited | null>(null);

export function MarkdownEditorMediator({ children }: { children: ReactNode }) {
    const [editorBeingEdited, editMarkdownEditor] = useState<string | null>(
        null,
    );
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
    markdown: string;
    onMarkdownCommitted: (markdown: string) => void;
    errors?: ProseCheckError[];
    highlights?: AuthorFileEditorFindHighlight[];
    onFixAsked?: (error: ProseCheckError) => void;
    children?: (markdown: string) => ReactNode;
}

export function MarkdownEditor({
    markdown,
    onMarkdownCommitted,
    errors = [],
    highlights = [],
    onFixAsked = () => undefined,
    children,
}: MarkdownEditorProps) {
    const { isEditing, beginEditing, finishEditing } =
        useMarkdownEditorBeingEdited(useId());
    const [markdownShown, showMarkdown] = useState(markdown);

    useEffect(() => {
        showMarkdown(markdown);
    }, [markdown]);

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
                onDoubleClick={beginEditing}
                dangerouslySetInnerHTML={{
                    __html: markedUp(
                        marked.parse(fenced(markdownShown, highlights), {
                            async: false,
                            gfm: true,
                        }),
                    ),
                }}
            />
        );
    }

    return (
        <MonacoMarkdownEditor
            markdown={markdownShown}
            errors={errors}
            highlights={highlights}
            onFixAsked={onFixAsked}
            onMarkdownChanged={(typed) => {
                showMarkdown(typed);
                onMarkdownCommitted(typed);
            }}
            onFinished={finishEditing}
        />
    );
}

interface MonacoMarkdownEditorProps {
    markdown: string;
    errors: ProseCheckError[];
    highlights: AuthorFileEditorFindHighlight[];
    onFixAsked: (error: ProseCheckError) => void;
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
    onFixAsked,
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
    const errorsNow = useRef(errors);
    errorsNow.current = errors;
    const [errorUnderPointer, sayErrorUnderPointer] =
        useState<MarkdownEditorErrorUnderPointer | null>(null);
    const hidingTheTooltip = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    const pointerIsOnTheTooltip = useRef(false);
    const latestCallbacks = useRef({ onMarkdownChanged, onFinished });
    latestCallbacks.current = { onMarkdownChanged, onFinished };

    useEffect(() => {
        const node = editorHost.current;
        if (!node) {
            return;
        }
        const editorForeground = getComputedStyle(document.body)
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
            editor.dispose();
        };
    }, []);

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
