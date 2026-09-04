import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../author_file_editor_commands";
import { Cell, NOTE } from "../../vscode_runtime/storydoc/model";
import "./NotesCell.css";

interface NotesCellProps {
    cell: Cell;
}

export function NotesCell({ cell }: NotesCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Note</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={noteWithinComment(cell.source)}
                    onMarkdownCommitted={(note) =>
                        cell.replaceMarkdown(`<!--\n${note}\n-->`)
                    }
                >
                    {(note) => (
                        <div className="notes-cell-rendered">{note}</div>
                    )}
                </MarkdownEditor>
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
