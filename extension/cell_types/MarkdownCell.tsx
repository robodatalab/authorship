import { useState } from "react";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import type { AuthorDocumentCellEditCommand } from "../author_editor/author_document_cell_edit_command";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { marked } from "marked";
import "./MarkdownCell.css";

interface MarkdownCellProps {
    markdown: string;
    editCommand: AuthorDocumentCellEditCommand;
}

export function MarkdownCell({ markdown, editCommand }: MarkdownCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draftMarkdown, setDraftMarkdown] = useState(markdown);

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
                    <MarkdownEditor
                        markdown={draftMarkdown}
                        onMarkdownChanged={setDraftMarkdown}
                        onFinished={commit}
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

function renderMarkdown(source: string): string {
    return marked.parse(source, { async: false, gfm: true });
}
