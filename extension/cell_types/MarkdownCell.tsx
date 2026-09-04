import { useLayoutEffect, useRef, useState } from "react";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import type { AuthorDocumentCellEditCommand } from "../author_editor/author_document_cell_edit_command";
import { renderMarkdown } from "../markdown/markdown_renderer";
import "./MarkdownCell.css";

interface MarkdownCellProps {
    markdown: string;
    editCommand: AuthorDocumentCellEditCommand;
}

export function MarkdownCell({ markdown, editCommand }: MarkdownCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draftMarkdown, setDraftMarkdown] = useState(markdown);
    const box = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        const input = box.current;
        if (!input) {
            return;
        }
        input.style.height = "auto";
        input.style.height = `${input.scrollHeight}px`;
    }, [isEditing, draftMarkdown]);

    useLayoutEffect(() => {
        if (isEditing) {
            box.current?.focus();
        }
    }, [isEditing]);

    function beginEditing(): void {
        setDraftMarkdown(markdown);
        setIsEditing(true);
    }

    function commit(): void {
        setIsEditing(false);
        editCommand.invoke(draftMarkdown);
    }

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader></AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                {isEditing ? (
                    <textarea
                        ref={box}
                        className="markdown-cell-source"
                        value={draftMarkdown}
                        onChange={(event) =>
                            setDraftMarkdown(event.currentTarget.value)
                        }
                        onBlur={commit}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                event.preventDefault();
                                commit();
                            }
                        }}
                    />
                ) : (
                    <div
                        className="markdown-cell-rendered"
                        onDoubleClick={beginEditing}
                        dangerouslySetInnerHTML={{
                            __html: renderMarkdown(markdown),
                        }}
                    />
                )}
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}
