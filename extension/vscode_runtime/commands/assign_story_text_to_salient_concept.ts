import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { SalientConceptCell } from "../../library/storydoc/cells/salient_concept_cell";
import { StoryWordsIterator } from "../../library/storydoc/iterators/story_words_iterator";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AssignStoryTextToSalientConceptCommand implements AuthorDocumentCommand {
    readonly commandName = "assignStoryTextToSalientConcept";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        session.changeTheDocument((story) => {
            const annotationIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const storyWords = new StoryWordsIterator(story);
            const wordsAssigned = storyWords.rangeBetween(
                commandArguments.cellId as string,
                commandArguments.startCharacterOffsetInCell as number,
                commandArguments.endCharacterOffsetInCell as number,
            );
            const annotation = story.cells[annotationIndex];
            if (
                !(annotation instanceof SalientConceptCell) ||
                wordsAssigned === null
            ) {
                return;
            }
            if (
                annotation.storyWordRanges.some(
                    (range) =>
                        range.firstWord === wordsAssigned.firstWord &&
                        range.lastWord === wordsAssigned.lastWord,
                )
            ) {
                return;
            }
            const storyWordRanges = [
                ...annotation.storyWordRanges,
                wordsAssigned,
            ];
            story.cells[annotationIndex] = new SalientConceptCell(
                annotation.title,
                storyWordRanges,
                annotation.source,
                annotation.folded,
                annotation.at,
                annotation.uniqueId,
            );
        });
    }
}
