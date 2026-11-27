import { useAuthorFileEditorSelection } from "../author_editor/AuthorFileEditorSelectionFence";
import "./StoryAnnotationCells.css";

const SHOW_IN_THE_MANUSCRIPT = "Highlight its words in the manuscript";
const STOP_SHOWING_IN_THE_MANUSCRIPT = "Stop highlighting its words in the manuscript";

interface AuthorFileEditorStoryAnnotationShownInTheManuscriptProps {
    cellKind: string;
    annotationCellId: string;
    isShown: boolean;
}

export function AuthorFileEditorStoryAnnotationShownInTheManuscript({
    cellKind,
    annotationCellId,
    isShown,
}: AuthorFileEditorStoryAnnotationShownInTheManuscriptProps) {
    const { selectTheStoryAnnotation } = useAuthorFileEditorSelection();
    const said = isShown ? STOP_SHOWING_IN_THE_MANUSCRIPT : SHOW_IN_THE_MANUSCRIPT;

    return (
        <button
            type="button"
            className="author-file-editor-cell-actions-button author-file-editor-story-annotation-shown-in-the-manuscript"
            title={said}
            aria-label={said}
            aria-pressed={isShown}
            onClick={() =>
                selectTheStoryAnnotation(
                    cellKind,
                    isShown ? null : annotationCellId,
                )
            }
        >
            <i className={isShown ? "codicon codicon-eye" : "codicon codicon-eye-closed"} />
        </button>
    );
}
