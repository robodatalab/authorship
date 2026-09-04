import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import {
    conf as markdownConfiguration,
    language as markdownLanguage,
} from "monaco-editor/languages/definitions/markdown/markdown.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import type { Cell } from "../storydoc/model";
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

interface CellBeingEditedMediator {
    cellBeingEdited: Cell | null;
    editCell: (cell: Cell | null) => void;
}

const CellBeingEdited = createContext<CellBeingEditedMediator | null>(null);

export function MarkdownEditorMediator({ children }: { children: ReactNode }) {
    const [cellBeingEdited, editCell] = useState<Cell | null>(null);
    return (
        <CellBeingEdited.Provider value={{ cellBeingEdited, editCell }}>
            {children}
        </CellBeingEdited.Provider>
    );
}

function useCellBeingEdited(cell: Cell) {
    const mediator = useContext(CellBeingEdited);
    if (!mediator) {
        throw new Error(
            "A MarkdownEditor can only be rendered inside a MarkdownEditorMediator.",
        );
    }
    return {
        isEditing: mediator.cellBeingEdited === cell,
        beginEditing: () => mediator.editCell(cell),
        finishEditing: () => mediator.editCell(null),
    };
}

interface MarkdownEditorProps {
    cell: Cell;
    markdownFromSource?: (source: string) => string;
    sourceFromMarkdown?: (markdown: string) => string;
    children: (markdown: string) => ReactNode;
}

export function MarkdownEditor({
    cell,
    markdownFromSource = (source) => source,
    sourceFromMarkdown = (markdown) => markdown,
    children,
}: MarkdownEditorProps) {
    const markdown = markdownFromSource(cell.source);
    const { isEditing, beginEditing, finishEditing } = useCellBeingEdited(cell);
    const [draftMarkdown, setDraftMarkdown] = useState(markdown);

    useEffect(() => {
        setDraftMarkdown(markdown);
    }, [markdown]);

    if (!isEditing) {
        return (
            <div
                onDoubleClick={() => {
                    setDraftMarkdown(markdown);
                    beginEditing();
                }}
            >
                {children(markdown)}
            </div>
        );
    }

    return (
        <MonacoMarkdownEditor
            markdown={draftMarkdown}
            onMarkdownChanged={setDraftMarkdown}
            onSettled={(settled) =>
                cell.replaceMarkdown(sourceFromMarkdown(settled))
            }
            onFinished={() => {
                finishEditing();
                cell.replaceMarkdown(sourceFromMarkdown(draftMarkdown));
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
        const editor = monaco.editor.create(node, {
            value: markdown,
            language: "markdown",
            theme: document.body.classList.contains("vscode-light")
                ? "vs"
                : "vs-dark",
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
        const forwardToWindow = (key: string, shiftKey = false): void => {
            window.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key,
                    ctrlKey: true,
                    metaKey: true,
                    shiftKey,
                    bubbles: true,
                }),
            );
        };
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () =>
            forwardToWindow("z"),
        );
        editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
            () => forwardToWindow("z", true),
        );
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () =>
            forwardToWindow("y"),
        );
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
            forwardToWindow("s"),
        );
        openEditor.current = editor;

        fitToContent();
        editor.focus();

        return () => {
            openEditor.current = null;
            window.removeEventListener("keydown", escaped, true);
            clearTimeout(settling);
            latest.current.onSettled(editor.getValue());
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
