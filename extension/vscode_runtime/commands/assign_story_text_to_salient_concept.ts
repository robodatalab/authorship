import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    SalientConceptCell,
    SalientConceptReference,
} from "authordoc/cells/salient_concept_cell";
import { StoryWordsIterator } from "authordoc/iterators/story_words_iterator";
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
            const storyWords = new StoryWordsIterator(story);
            const wordsAssigned = storyWords.rangeBetween(
                commandArguments.cellId as string,
                commandArguments.startCharacterOffsetInCell as number,
                commandArguments.endCharacterOffsetInCell as number,
            );
            const annotation = story.cellWithId(annotationCellId);
            if (
                !(annotation instanceof SalientConceptCell) ||
                wordsAssigned === null
            ) {
                return story;
            }
            if (
                annotation.references.some(
                    (reference) =>
                        reference.storyWordRange.firstWord ===
                            wordsAssigned.firstWord &&
                        reference.storyWordRange.lastWord ===
                            wordsAssigned.lastWord,
                )
            ) {
                return story;
            }
            const referenceId = crypto.randomUUID();
            const referenceAdded = new SalientConceptReference(
                referenceId,
                wordsAssigned,
            );
            const references = [...annotation.references, referenceAdded];
            const annotationReferencing = new SalientConceptCell(
                annotation.title,
                references,
                annotation.source,
                annotation.folded,
                annotation.at,
                annotation.uniqueId,
            );
            const storyChanged = story.withCell(annotationReferencing);
            return storyChanged;
        });
    }
}
