import type { WebviewCell } from "./AuthorFileEditorCanvas";
import { CHAPTER, PART } from "../../vscode_runtime/storydoc/model";
import "./AuthorFileEditorPartAndChapterInView.css";

interface AuthorFileEditorPartAndChapterInViewProps {
    cells: WebviewCell[];
    cellIdInView?: string;
    wordsInTheDocument?: number;
}

const UNTITLED = "Untitled";

interface PartAndChapter {
    partTitle: string;
    chapterTitle: string;
}

function partAndChapterAt(
    cells: WebviewCell[],
    cellIdInView: string | undefined,
): PartAndChapter {
    let partTitle = "";
    let chapterTitle = "";
    for (const cell of cells) {
        if (cell.kind === PART) {
            partTitle = cell.attrs.title || UNTITLED;
            chapterTitle = "";
        }
        if (cell.kind === CHAPTER) {
            chapterTitle = cell.attrs.title || UNTITLED;
        }
        if (cell.attrs.id === cellIdInView) {
            return { partTitle, chapterTitle };
        }
    }
    return { partTitle: "", chapterTitle: "" };
}

export function AuthorFileEditorPartAndChapterInView({
    cells,
    cellIdInView,
    wordsInTheDocument = 0,
}: AuthorFileEditorPartAndChapterInViewProps) {
    const { partTitle, chapterTitle } = partAndChapterAt(cells, cellIdInView);
    const said = [partTitle, chapterTitle].filter(Boolean);

    return (
        <div className="author-file-editor-part-and-chapter-in-view">
            {said.length > 0 && (
                <span className="author-file-editor-part-and-chapter-said">
                    {said.join(" / ")}
                </span>
            )}
            <span className="author-file-editor-words-in-the-document">
                {wordsInTheDocument.toLocaleString()} words
            </span>
        </div>
    );
}
