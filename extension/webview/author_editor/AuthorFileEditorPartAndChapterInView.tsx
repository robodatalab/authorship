import type { Cell } from "authordoc/cells/cell";
import { ChapterCell } from "authordoc/cells/chapter_cell";
import { PartCell } from "authordoc/cells/part_cell";
import {
    cellsBySection,
    whereACellStands,
} from "authordoc/story_sections";
import "./AuthorFileEditorPartAndChapterInView.css";

interface AuthorFileEditorPartAndChapterInViewProps {
    cells: Cell[];
    cellIdInView?: string;
    wordsInTheDocument?: number;
}

const UNTITLED = "Untitled";

interface PartAndChapter {
    partTitle: string;
    chapterTitle: string;
}

function partAndChapterAt(
    cells: Cell[],
    cellIdInView: string | undefined,
): PartAndChapter {
    const sections = cellsBySection(cells);
    const standing = cellIdInView
        ? whereACellStands(sections, cellIdInView)
        : undefined;
    if (!standing) {
        return { partTitle: "", chapterTitle: "" };
    }
    const cellsItStandsIn = [...standing.under, standing.section].map(
        (section) => section.cell,
    );
    const part = cellsItStandsIn.find((cell) => cell instanceof PartCell);
    const chapter = cellsItStandsIn.find(
        (cell) => cell instanceof ChapterCell,
    );
    return {
        partTitle: part ? part.title || UNTITLED : "",
        chapterTitle: chapter ? chapter.title || UNTITLED : "",
    };
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
