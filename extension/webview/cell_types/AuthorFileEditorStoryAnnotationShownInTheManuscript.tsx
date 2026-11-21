import type { SendMessagesToVscode } from "../author_editor/AuthorFileEditorCanvas";
import "./StoryAnnotationCells.css";

const SHOW_IN_THE_MANUSCRIPT = "Highlight its words in the manuscript";
const STOP_SHOWING_IN_THE_MANUSCRIPT = "Stop highlighting its words in the manuscript";

interface AuthorFileEditorStoryAnnotationShownInTheManuscriptProps {
    cellKind: string;
    annotationCellId: string;
    isShown: boolean;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorStoryAnnotationShownInTheManuscript({
    cellKind,
    annotationCellId,
    isShown,
    sendMessagesToVscode,
}: AuthorFileEditorStoryAnnotationShownInTheManuscriptProps) {
    const said = isShown ? STOP_SHOWING_IN_THE_MANUSCRIPT : SHOW_IN_THE_MANUSCRIPT;

    return (
        <button
            type="button"
            className="author-file-editor-cell-actions-button author-file-editor-story-annotation-shown-in-the-manuscript"
            title={said}
            aria-label={said}
            aria-pressed={isShown}
            onClick={() =>
                sendMessagesToVscode({
                    type: "selectStoryAnnotation",
                    cellKind,
                    annotationCellId: isShown ? null : annotationCellId,
                })
            }
        >
            <i className={isShown ? "codicon codicon-eye" : "codicon codicon-eye-closed"} />
        </button>
    );
}
