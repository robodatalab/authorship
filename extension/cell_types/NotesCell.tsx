import { useEffect, useState } from "react";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../author_editor/author_document_cell_types";
import { Cell, NOTE } from "../storydoc/model";
import "./NotesCell.css";

interface NotesCellProps {
    cell: Cell;
}

export function NotesCell({ cell }: NotesCellProps) {
    const source = cell.source;
    const note = noteWithinComment(source);
    const [isEditing, setIsEditing] = useState(false);
    const [draftNote, setDraftNote] = useState(note);

    useEffect(() => {
        setDraftNote(note);
    }, [note]);

    function beginEditing(): void {
        setDraftNote(note);
        setIsEditing(true);
    }

    function commit(): void {
        setIsEditing(false);
        cell.replaceMarkdown(`<!--\n${draftNote}\n-->`);
    }

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Note</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                {isEditing ? (
                    <MarkdownEditor
                        markdown={draftNote}
                        onMarkdownChanged={setDraftNote}
                        onSettled={(settled) =>
                            cell.replaceMarkdown(`<!--\n${settled}\n-->`)
                        }
                        onFinished={commit}
                    />
                ) : (
                    <div
                        className="notes-cell-rendered"
                        onDoubleClick={beginEditing}
                    >
                        {note}
                    </div>
                )}
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

function noteWithinComment(source: string): string {
    const opened = source.indexOf("<!--");
    if (opened < 0) {
        return source;
    }
    const closed = source.lastIndexOf("-->");
    const inside =
        closed > opened
            ? source.slice(opened + 4, closed)
            : source.slice(opened + 4);
    return inside.replace(/^\n+/, "").replace(/\n+$/, "");
}

registerAuthorDocumentCellType({
    kind: NOTE,
    label: "Note",
    category: "primary",
    render: (document, cellIndex) => (
        <NotesCell cell={document.cells[cellIndex]} />
    ),
    create: () => new Cell(NOTE, "", {}),
});
