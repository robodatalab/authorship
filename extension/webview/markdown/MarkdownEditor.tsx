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
import { LinterTooltip, type ProseError } from "../linter/LinterTooltip";
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
]);

const SETTLE_AFTER_TYPING_MS = 400;
/** Long enough to reach the tooltip from the word it belongs to. */
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
    errors?: ProseError[];
    onFixAsked?: (error: ProseError) => void;
    children?: (markdown: string) => ReactNode;
}

export function MarkdownEditor({
    markdown,
    onMarkdownCommitted,
    errors = [],
    onFixAsked = () => undefined,
    children,
}: MarkdownEditorProps) {
    const { isEditing, beginEditing, finishEditing } =
        useMarkdownEditorBeingEdited(useId());
    const [draftMarkdown, setDraftMarkdown] = useState(markdown);

    useEffect(() => {
        setDraftMarkdown(markdown);
    }, [markdown]);

    const openOnDoubleClick = (): void => {
        setDraftMarkdown(markdown);
        beginEditing();
    };

    if (!isEditing && children) {
        return (
            <div
                className="markdown-rendered"
                onDoubleClick={openOnDoubleClick}
            >
                {children(markdown)}
            </div>
        );
    }

    if (!isEditing) {
        return (
            <div
                className="markdown-rendered"
                onDoubleClick={openOnDoubleClick}
                dangerouslySetInnerHTML={{
                    __html: marked.parse(markdown, { async: false, gfm: true }),
                }}
            />
        );
    }

    return (
        <MonacoMarkdownEditor
            markdown={draftMarkdown}
            errors={errors}
            onFixAsked={onFixAsked}
            onMarkdownChanged={setDraftMarkdown}
            onSettled={onMarkdownCommitted}
            onFinished={() => {
                finishEditing();
                onMarkdownCommitted(draftMarkdown);
            }}
        />
    );
}

interface MonacoMarkdownEditorProps {
    markdown: string;
    errors: ProseError[];
    onFixAsked: (error: ProseError) => void;
    onMarkdownChanged: (markdown: string) => void;
    onSettled: (markdown: string) => void;
    onFinished: () => void;
}

/** An error the pointer is on, and where in the editor to say so. */
interface MarkdownEditorErrorUnderPointer {
    error: ProseError;
    top: number;
    left: number;
}

function MonacoMarkdownEditor({
    markdown,
    errors,
    onFixAsked,
    onMarkdownChanged,
    onSettled,
    onFinished,
}: MonacoMarkdownEditorProps) {
    const host = useRef<HTMLDivElement>(null);
    const openEditor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const marks = useRef<monaco.editor.IEditorDecorationsCollection | null>(
        null,
    );
    const errorsFound = useRef(errors);
    errorsFound.current = errors;
    const [errorUnderPointer, sayErrorUnderPointer] =
        useState<MarkdownEditorErrorUnderPointer | null>(null);
    const leaving = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    const latest = useRef({ onMarkdownChanged, onSettled, onFinished });
    latest.current = { onMarkdownChanged, onSettled, onFinished };

    useEffect(() => {
        const node = host.current;
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

        marks.current = editor.createDecorationsCollection([]);

        const pointedAt = (
            event: monaco.editor.IEditorMouseEvent,
        ): MarkdownEditorErrorUnderPointer | null => {
            const model = editor.getModel();
            const position = event.target.position;
            if (!model || !position) {
                return null;
            }
            const offset = model.getOffsetAt(position);
            const error = errorsFound.current.find(
                (found) => offset >= found.at && offset <= found.end,
            );
            const drawnAt =
                error && editor.getScrolledVisiblePosition(position);
            if (!error || !drawnAt) {
                return null;
            }
            // The page it is drawn on is clipped by the cell it is in, so the
            // words are put on the window itself rather than in the editor.
            const editorBox = node.getBoundingClientRect();
            return {
                error,
                top: editorBox.top + drawnAt.top + drawnAt.height,
                left: editorBox.left + drawnAt.left,
            };
        };

        const sized = editor.onDidContentSizeChange(fitToContent);
        const pointed = editor.onMouseMove((event) => {
            const found = pointedAt(event);
            if (found) {
                clearTimeout(leaving.current);
                sayErrorUnderPointer(found);
            } else {
                leaving.current = setTimeout(
                    () => sayErrorUnderPointer(null),
                    HOLD_TOOLTIP_MS,
                );
            }
        });
        let settling: ReturnType<typeof setTimeout> | undefined;
        const changed = editor.onDidChangeModelContent(() => {
            latest.current.onMarkdownChanged(editor.getValue());
            clearTimeout(settling);
            settling = setTimeout(
                () => latest.current.onSettled(editor.getValue()),
                SETTLE_AFTER_TYPING_MS,
            );
        });
        const escaped = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                latest.current.onFinished();
            }
        };
        window.addEventListener("keydown", escaped, true);
        openEditor.current = editor;

        fitToContent();
        editor.focus();

        return () => {
            openEditor.current = null;
            window.removeEventListener("keydown", escaped, true);
            clearTimeout(settling);
            clearTimeout(leaving.current);
            sized.dispose();
            pointed.dispose();
            changed.dispose();
            editor.dispose();
        };
    }, []);

    useEffect(() => {
        const editor = openEditor.current;
        if (editor && editor.getValue() !== markdown) {
            editor.setValue(markdown);
        }
    }, [markdown]);

    useEffect(() => {
        const model = openEditor.current?.getModel();
        if (!model) {
            return;
        }
        marks.current?.set(
            errors.map((error) => ({
                range: monaco.Range.fromPositions(
                    model.getPositionAt(error.at),
                    model.getPositionAt(error.end),
                ),
                options: { inlineClassName: "markdown-editor-mark" },
            })),
        );
    }, [errors, markdown]);

    return (
        <>
            <div className="markdown-editor" ref={host} />
            {errorUnderPointer &&
                createPortal(
                    <div
                        className="markdown-editor-mark-said"
                        style={{
                            top: errorUnderPointer.top,
                            left: errorUnderPointer.left,
                        }}
                        onMouseEnter={() => clearTimeout(leaving.current)}
                        onMouseLeave={() => sayErrorUnderPointer(null)}
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
