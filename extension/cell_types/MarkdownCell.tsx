import { useEffect, useState } from "react";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../author_editor/author_document_cell_types";
import { Cell, MARKDOWN } from "../storydoc/model";
import { marked } from "marked";
import "./MarkdownCell.css";

interface MarkdownCellProps {
    cell: Cell;
}

export function MarkdownCell({ cell }: MarkdownCellProps) {
    const markdown = cell.source;
    const [isEditing, setIsEditing] = useState(false);
    const [draftMarkdown, setDraftMarkdown] = useState(markdown);

    useEffect(() => {
        setDraftMarkdown(markdown);
    }, [markdown]);

    function beginEditing(): void {
        setDraftMarkdown(markdown);
        setIsEditing(true);
    }

    function commit(): void {
        setIsEditing(false);
        cell.replaceMarkdown(draftMarkdown);
    }

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Markdown</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                {isEditing ? (
                    <MarkdownEditor
                        markdown={draftMarkdown}
                        onMarkdownChanged={setDraftMarkdown}
                        onSettled={(settled) => cell.replaceMarkdown(settled)}
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
        <MarkdownCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(MARKDOWN, "", {}),
});
