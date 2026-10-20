import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    useAuthorFileEditorCellFindHighlights,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { markedText } from "../author_editor/AuthorFileEditorFind";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    sayTheAuthorTypedInTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import { NOTE, type NoteCell } from "../../library/storydoc/cells/note_cell";
import "./NotesCell.css";

interface AuthorFileEditorNoteCellProps {
    cell: NoteCell;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorNoteCell({
    cell,
    sendMessagesToVscode,
}: AuthorFileEditorNoteCellProps) {
    const note = noteWithinComment(cell.source);
    // A note's prose is the comment it is written inside, so the matches are
    // placed against that and have to be brought back to where the note starts.
    const noteBegins = cell.source.indexOf(note);
    const findHighlights = useAuthorFileEditorCellFindHighlights()
        .map((highlight) => ({
            ...highlight,
            at: highlight.at - noteBegins,
            end: highlight.end - noteBegins,
        }))
        .filter(
            (highlight) => highlight.at >= 0 && highlight.end <= note.length,
        );
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Note</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    cellId={cell.uniqueId}
                    highlights={findHighlights}
                    markdown={note}
                    timesTheHostWroteIt={timesTheHostWroteIt}
                    onMarkdownCommitted={(editedNote) =>
                        sayTheAuthorTypedInTheCell(
                            sendMessagesToVscode,
                            cell.uniqueId,
                            `<!--\n${editedNote}\n-->`,
                        )
                    }
                >
                    {(fencedNote) => (
                        <div className="notes-cell-rendered">
                            {markedText(fencedNote).map((run, runIndex) =>
                                run.isMatch ? (
                                    <mark
                                        key={runIndex}
                                        className={
                                            run.isCurrent
                                                ? "author-file-editor-find-match author-file-editor-find-match-current"
                                                : "author-file-editor-find-match"
                                        }
                                    >
                                        {run.text}
                                    </mark>
                                ) : (
                                    run.text
                                ),
                            )}
                        </div>
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
    cellKind: NOTE,
    menuLabel: "Note",
    insertMenuGroup: "primary",
});
