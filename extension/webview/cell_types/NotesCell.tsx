import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    useAuthorFileEditorCellFindHighlights,
} from "../author_editor/AuthorFileEditorCell";
import { markedText } from "../author_editor/AuthorFileEditorFind";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    invokeAuthorDocumentCommand,
    type SendMessagesToVscode,
    type WebviewCell,
} from "../author_editor/AuthorFileEditorCanvas";
import { NOTE } from "../../vscode_runtime/storydoc/model";
import "./NotesCell.css";

interface NotesCellProps {
    cell: WebviewCell;
    cellId: string;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function NotesCell({
    cell,
    cellId,
    sendMessagesToVscode,
}: NotesCellProps) {
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

    return (
        <AuthorFileEditorCell>
            <AuthorFileEditorCellHeader>Note</AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <MarkdownEditor
                    cellId={cellId}
                    highlights={findHighlights}
                    markdown={note}
                    onMarkdownCommitted={(editedNote) =>
                        invokeAuthorDocumentCommand(
                            sendMessagesToVscode,
                            "replaceMarkdown",
                            { cellId, markdown: `<!--\n${editedNote}\n-->` },
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
    render: (cell, cellId, sendMessagesToVscode) => (
        <NotesCell
            cell={cell}
            cellId={cellId}
            sendMessagesToVscode={sendMessagesToVscode}
        />
    ),
});
