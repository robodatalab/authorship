import type { WebviewCell } from "./AuthorFileEditorCanvas";
import { CHAPTER, PART } from "../../vscode_runtime/storydoc/model";
import {
    cellsBySection,
    whereACellStands,
} from "../../vscode_runtime/storydoc/sections";
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
    const standing = cellIdInView
        ? whereACellStands(cellsBySection(cells), cellIdInView)
        : undefined;
    if (!standing) {
        return { partTitle: "", chapterTitle: "" };
    }
    const sectionsItStandsIn = [...standing.under, standing.section];
    return {
        partTitle: titleOfTheSectionOfKind(sectionsItStandsIn, PART),
        chapterTitle: titleOfTheSectionOfKind(sectionsItStandsIn, CHAPTER),
    };
}

function titleOfTheSectionOfKind(
    sectionsItStandsIn: { cell: WebviewCell }[],
    kind: string,
): string {
    const section = sectionsItStandsIn.find(({ cell }) => cell.kind === kind);
    return section ? section.cell.attrs.title || UNTITLED : "";
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
