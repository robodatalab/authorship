import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
} from "../author_editor/AuthorFileEditorCell";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import type { WebviewCell } from "../author_editor/AuthorFileEditorCanvas";
import {
    replaceCellAttribute,
    replaceCellMarkdown,
    type PostToHost,
} from "../../vscode_runtime/commands/author_file_editor_buttons";
import { NOTE } from "../../vscode_runtime/storydoc/model";
import "./NotesCell.css";

interface NotesCellProps {
    cell: WebviewCell;
    at: number;
    postToHost: PostToHost;
}

export function NotesCell({ cell, at, postToHost }: NotesCellProps) {
    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Note</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    markdown={noteWithinComment(cell.source)}
                    onMarkdownCommitted={(note) =>
                        replaceCellMarkdown(
                            postToHost,
                            at,
                            `<!--\n${note}\n-->`,
                        )
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
    render: (cell, at, postToHost) => (
        <NotesCell cell={cell} at={at} postToHost={postToHost} />
    ),
    create: () => ({ kind: NOTE, source: "", attrs: {} }),
});
