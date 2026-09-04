import { useState } from "react";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import type { AuthorDocumentCellEditCommand } from "../author_editor/author_document_cell_edit_command";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../author_editor/author_document_cell_types";
import { MARKDOWN } from "../storydoc/model";
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
            <AuthorFileEditorCellHeader>Markdown</AuthorFileEditorCellHeader>
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
                            __html: marked.parse(markdown, {
                                async: false,
                                gfm: true,
                            }),
                        }}
                    />
                )}
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    kind: MARKDOWN,
    label: "Markdown",
    category: "primary",
    render: (document, cellIndex) => (
        <MarkdownCell
            markdown={document.cells[cellIndex].source}
            editCommand={{
                invoke: (markdown) =>
                    document.replaceCellMarkdown(cellIndex, markdown),
            }}
        />
    ),
    create: () => ({ kind: MARKDOWN, source: "", attrs: {} }),
});
