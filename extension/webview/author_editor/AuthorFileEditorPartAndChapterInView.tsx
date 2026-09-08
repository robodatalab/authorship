import type { WebviewCell } from "./AuthorFileEditorCanvas";
import { CHAPTER, PART } from "../../vscode_runtime/storydoc/model";
import "./AuthorFileEditorPartAndChapterInView.css";

interface AuthorFileEditorPartAndChapterInViewProps {
    cells: WebviewCell[];
    cellIdInView?: string;
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
}: AuthorFileEditorPartAndChapterInViewProps) {
    const { partTitle, chapterTitle } = partAndChapterAt(cells, cellIdInView);
    const said = [partTitle, chapterTitle].filter(Boolean);

    if (said.length === 0) {
        return null;
    }

    return (
        <div className="author-file-editor-part-and-chapter-in-view">
            {said.join(" / ")}
        </div>
    );
}
