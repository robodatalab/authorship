import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import {
    conf as markdownConfiguration,
    language as markdownLanguage,
} from "monaco-editor/languages/definitions/markdown/markdown.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
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

interface MarkdownEditorProps {
    markdown: string;
    onMarkdownChanged: (markdown: string) => void;
    onSettled: (markdown: string) => void;
    onFinished: () => void;
}

export function MarkdownEditor({
    markdown,
    onMarkdownChanged,
    onSettled,
    onFinished,
}: MarkdownEditorProps) {
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
        const blurred = editor.onDidBlurEditorWidget(() =>
            latest.current.onFinished(),
        );
        editor.addCommand(monaco.KeyCode.Escape, () =>
            latest.current.onFinished(),
        );
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
            clearTimeout(settling);
            sized.dispose();
            changed.dispose();
            blurred.dispose();
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
