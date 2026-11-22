import { useMemo } from "react";
import {
    AuthorFileEditorCell,
    AuthorFileEditorCellHeader,
    AuthorFileEditorCellHeaderTitle,
    AuthorFileEditorCellBody,
    AuthorFileEditorCellFooter,
    AuthorFileEditorCellCard,
    useAuthorFileEditorCellFindHighlights,
    useAuthorFileEditorCellTimesTheHostWroteIt,
} from "../author_editor/AuthorFileEditorCell";
import { AuthorFileEditorCellFields } from "../author_editor/AuthorFileEditorCellFields";
import type { AuthorFileEditorCellField } from "../author_editor/AuthorFileEditorCellFields";
import { MarkdownEditor } from "../markdown/MarkdownEditor";
import { registerAuthorDocumentCellType } from "../../vscode_runtime/commands/author_document_cell_types";
import {
    replaceTheCell,
    sayTheAuthorTypedInTheCell,
    type SendMessagesToVscode,
} from "../author_editor/AuthorFileEditorCanvas";
import { AuthorFileEditorStoryAnnotationShownInTheManuscript } from "./AuthorFileEditorStoryAnnotationShownInTheManuscript";
import {
    SALIENT_CONCEPT,
    SalientConceptCell,
} from "authordoc/cells/salient_concept_cell";
import { StoryAnnotationsIterator } from "authordoc/iterators/story_annotations_iterator";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";
import type { Document } from "authordoc/storydoc";
import "./StoryAnnotationCells.css";

const ASSIGN_THE_WORDS_SELECTED = "Assign the selected words to this concept";
const TAKE_THE_REFERENCE_OUT = "Take these words out of the concept";

interface AuthorFileEditorSalientConceptCellProps {
    cell: SalientConceptCell;
    story: Document;
    isShownInTheManuscript: boolean;
    referenceIdSelected: string | null;
    storyTextSelected: StoryTextSpan | null;
    sendMessagesToVscode: SendMessagesToVscode;
}

export function AuthorFileEditorSalientConceptCell({
    cell,
    story,
    isShownInTheManuscript,
    referenceIdSelected,
    storyTextSelected,
    sendMessagesToVscode,
}: AuthorFileEditorSalientConceptCellProps) {
    const findHighlights = useAuthorFileEditorCellFindHighlights();
    const timesTheHostWroteIt = useAuthorFileEditorCellTimesTheHostWroteIt();
    const referencesNewestFirst = useMemo(() => {
        const conceptsInTheStory = new StoryAnnotationsIterator(
            story,
            SALIENT_CONCEPT,
        );
        const conceptInTheStory = Array.from(conceptsInTheStory).find(
            (concept) => concept.annotationCellId === cell.uniqueId,
        );
        const references = conceptInTheStory?.passages ?? [];
        return [...references].reverse();
    }, [story, cell.uniqueId]);
    const fields: AuthorFileEditorCellField[] = [
        {
            label: "Title",
            said: cell.title,
            onSaid: (title) => {
                const retitled = new SalientConceptCell(
                    title,
                    cell.references,
                    cell.source,
                    cell.folded,
                    cell.at,
                    cell.uniqueId,
                );
                replaceTheCell(sendMessagesToVscode, retitled);
            },
        },
    ];

    function selectTheReference(referenceId: string): void {
        if (!isShownInTheManuscript) {
            sendMessagesToVscode({
                type: "selectStoryAnnotation",
                cellKind: SALIENT_CONCEPT,
                annotationCellId: cell.uniqueId,
            });
        }
        sendMessagesToVscode({
            type: "selectPassage",
            cellKind: SALIENT_CONCEPT,
            passageId: referenceId,
        });
    }

    return (
        <AuthorFileEditorCell
            actions={
                <AuthorFileEditorStoryAnnotationShownInTheManuscript
                    cellKind={SALIENT_CONCEPT}
                    annotationCellId={cell.uniqueId}
                    isShown={isShownInTheManuscript}
                    sendMessagesToVscode={sendMessagesToVscode}
                />
            }
        >
            <AuthorFileEditorCellHeader>
                Salient concept
                <AuthorFileEditorCellHeaderTitle title={cell.title} />
            </AuthorFileEditorCellHeader>
            <AuthorFileEditorCellBody>
                <AuthorFileEditorCellCard>
                    <AuthorFileEditorCellFields fields={fields} />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <MarkdownEditor
                        cellId={cell.uniqueId}
                        highlights={findHighlights}
                        markdown={cell.source}
                        timesTheHostWroteIt={timesTheHostWroteIt}
                        onMarkdownCommitted={(description) =>
                            sayTheAuthorTypedInTheCell(
                                sendMessagesToVscode,
                                cell.uniqueId,
                                description,
                            )
                        }
                    />
                </AuthorFileEditorCellCard>
                <AuthorFileEditorCellCard>
                    <div className="author-file-editor-story-annotation-passages-heading">
                        <h4>Examples</h4>
                        <button
                            type="button"
                            className="author-file-editor-story-annotation-assign"
                            title={ASSIGN_THE_WORDS_SELECTED}
                            aria-label={ASSIGN_THE_WORDS_SELECTED}
                            disabled={storyTextSelected === null}
                            onClick={() =>
                                sendMessagesToVscode({
                                    type: "invoke",
                                    commandName:
                                        "assignStoryTextToSalientConcept",
                                    commandArguments: {
                                        annotationCellId: cell.uniqueId,
                                        ...storyTextSelected,
                                    },
                                })
                            }
                        >
                            <i className="codicon codicon-add" />
                        </button>
                    </div>
                    {referencesNewestFirst.length === 0 ? (
                        <div className="author-file-editor-idle">
                            No words assigned yet
                        </div>
                    ) : (
                        <ul className="author-file-editor-story-annotation-passages">
                            {referencesNewestFirst.map((storyWordRange) => (
                                <li
                                    key={storyWordRange.passageId}
                                    className={
                                        storyWordRange.passageId ===
                                        referenceIdSelected
                                            ? "author-file-editor-story-annotation-passage author-file-editor-story-annotation-passage-selected"
                                            : "author-file-editor-story-annotation-passage"
                                    }
                                >
                                    <button
                                        type="button"
                                        className="author-file-editor-story-annotation-passage-shown"
                                        title={storyWordRange.wordsItCovers}
                                        aria-pressed={
                                            storyWordRange.passageId ===
                                            referenceIdSelected
                                        }
                                        onClick={() => {
                                            selectTheReference(
                                                storyWordRange.passageId,
                                            );
                                            sendMessagesToVscode({
                                                type: "showStoryWordRange",
                                                firstWord:
                                                    storyWordRange.firstWord,
                                                lastWord:
                                                    storyWordRange.lastWord,
                                            });
                                        }}
                                    >
                                        {storyWordRange.wordsItCovers}
                                    </button>
                                    <button
                                        type="button"
                                        className="author-file-editor-story-annotation-passage-removed"
                                        title={TAKE_THE_REFERENCE_OUT}
                                        aria-label={TAKE_THE_REFERENCE_OUT}
                                        onClick={() =>
                                            sendMessagesToVscode({
                                                type: "invoke",
                                                commandName:
                                                    "removeReferenceFromSalientConcept",
                                                commandArguments: {
                                                    annotationCellId:
                                                        cell.uniqueId,
                                                    referenceId:
                                                        storyWordRange.passageId,
                                                },
                                            })
                                        }
                                    >
                                        <i className="codicon codicon-close" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </AuthorFileEditorCellCard>
            </AuthorFileEditorCellBody>
            <AuthorFileEditorCellFooter></AuthorFileEditorCellFooter>
        </AuthorFileEditorCell>
    );
}

registerAuthorDocumentCellType({
    cellKind: SALIENT_CONCEPT,
    menuLabel: "Salient concept",
    insertMenuGroup: "primary",
});
