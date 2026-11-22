import { useState } from "react";
import "./StoryAnnotationCells.css";

const STOP_CHOOSING = "Close the list without choosing";

interface AuthorFileEditorReferencedCell {
    readonly uniqueId: string;
    readonly title: string;
}

export interface AuthorFileEditorCellReferencesWording {
    heading: string;
    referenceOne: string;
    stopReferencing: string;
    noneReferenced: string;
    untitled: string;
}

interface AuthorFileEditorCellReferencesProps {
    className: string;
    referencedCells: readonly AuthorFileEditorReferencedCell[];
    cellsToChoose: readonly AuthorFileEditorReferencedCell[];
    wording: AuthorFileEditorCellReferencesWording;
    onReferenced: (cellId: string) => void;
    onStoppedReferencing: (cellId: string) => void;
}

// The cells a cell or a part of it references: each can be stopped being
// referenced, and the story's other cells of the kind can be chosen to be.
export function AuthorFileEditorCellReferences({
    className,
    referencedCells,
    cellsToChoose,
    wording,
    onReferenced,
    onStoppedReferencing,
}: AuthorFileEditorCellReferencesProps) {
    const [choosing, setChoosing] = useState(false);

    function reference(cellId: string): void {
        setChoosing(false);
        onReferenced(cellId);
    }

    return (
        <div className={className}>
            <div className="author-file-editor-story-annotation-passages-heading">
                <h4>{wording.heading}</h4>
                <button
                    type="button"
                    className="author-file-editor-cell-reference-chosen"
                    title={choosing ? STOP_CHOOSING : wording.referenceOne}
                    aria-label={choosing ? STOP_CHOOSING : wording.referenceOne}
                    aria-expanded={choosing}
                    disabled={cellsToChoose.length === 0}
                    onClick={() => setChoosing(!choosing)}
                >
                    <i
                        className={
                            choosing
                                ? "codicon codicon-close"
                                : "codicon codicon-add"
                        }
                    />
                </button>
            </div>
            {choosing && cellsToChoose.length > 0 ? (
                <ul className="author-file-editor-story-annotation-passages author-file-editor-cell-references-to-choose">
                    {cellsToChoose.map((cell) => (
                        <li
                            key={cell.uniqueId}
                            className="author-file-editor-story-annotation-passage"
                        >
                            <button
                                type="button"
                                className="author-file-editor-story-annotation-passage-shown"
                                onClick={() => reference(cell.uniqueId)}
                            >
                                {cell.title || wording.untitled}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
            {referencedCells.length === 0 ? (
                <div className="author-file-editor-idle">
                    {wording.noneReferenced}
                </div>
            ) : (
                <ul className="author-file-editor-story-annotation-passages author-file-editor-cell-references-referenced">
                    {referencedCells.map((cell) => (
                        <li
                            key={cell.uniqueId}
                            className="author-file-editor-story-annotation-passage"
                        >
                            <span className="author-file-editor-story-annotation-passage-shown">
                                {cell.title || wording.untitled}
                            </span>
                            <button
                                type="button"
                                className="author-file-editor-story-annotation-passage-removed"
                                title={wording.stopReferencing}
                                aria-label={wording.stopReferencing}
                                onClick={() => onStoppedReferencing(cell.uniqueId)}
                            >
                                <i className="codicon codicon-close" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
