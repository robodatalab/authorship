import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import {
    conf as markdownConfiguration,
    language as markdownLanguage,
} from "monaco-editor/languages/definitions/markdown/markdown.js";
import "./MarkdownEditor.css";

monaco.languages.register({ id: "markdown" });
monaco.languages.setLanguageConfiguration("markdown", markdownConfiguration);
monaco.languages.setMonarchTokensProvider("markdown", markdownLanguage);

interface MarkdownEditorProps {
    markdown: string;
    onMarkdownChanged: (markdown: string) => void;
    onFinished: () => void;
}

export function MarkdownEditor({
    markdown,
    onMarkdownChanged,
    onFinished,
}: MarkdownEditorProps) {
    const host = useRef<HTMLDivElement>(null);
    const latest = useRef({ onMarkdownChanged, onFinished });
    latest.current = { onMarkdownChanged, onFinished };

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
        const changed = editor.onDidChangeModelContent(() =>
            latest.current.onMarkdownChanged(editor.getValue()),
        );
        const blurred = editor.onDidBlurEditorWidget(() =>
            latest.current.onFinished(),
        );
        editor.addCommand(monaco.KeyCode.Escape, () =>
            latest.current.onFinished(),
        );

        fitToContent();
        editor.focus();

        return () => {
            sized.dispose();
            changed.dispose();
            blurred.dispose();
            editor.dispose();
        };
    }, []);

    return <div className="markdown-editor" ref={host} />;
}
