import {
    createContext,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import {
    conf as markdownConfiguration,
    language as markdownLanguage,
} from "monaco-editor/languages/definitions/markdown/markdown.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import { marked } from "marked";
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
    children?: (markdown: string) => ReactNode;
}

export function MarkdownEditor({
    markdown,
    onMarkdownCommitted,
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
            <div className="markdown-rendered" onDoubleClick={openOnDoubleClick}>
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
    onMarkdownChanged: (markdown: string) => void;
    onSettled: (markdown: string) => void;
    onFinished: () => void;
}

function MonacoMarkdownEditor({
    markdown,
    onMarkdownChanged,
    onSettled,
    onFinished,
}: MonacoMarkdownEditorProps) {
    const host = useRef<HTMLDivElement>(null);
    const openEditor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
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

        const sized = editor.onDidContentSizeChange(fitToContent);
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
            sized.dispose();
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

    return <div className="markdown-editor" ref={host} />;
}
