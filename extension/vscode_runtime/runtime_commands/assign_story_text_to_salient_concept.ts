import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    SalientConceptCell,
    SalientConceptReference,
} from "authordoc/cells/salient_concept_cell";
import { StoryWordsIterator } from "authordoc/iterators/story_words_iterator";
import type { RuntimeCommand } from "./runtime_command";

export const ASSIGN_STORY_TEXT_TO_SALIENT_CONCEPT =
    "assignStoryTextToSalientConcept";

export class AssignStoryTextToSalientConceptCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly cellId: string,
        private readonly startCharacterOffsetInCell: number,
        private readonly endCharacterOffsetInCell: number,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AssignStoryTextToSalientConceptCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const cellId = serialized.cellId as string;
        const startCharacterOffsetInCell =
            serialized.startCharacterOffsetInCell as number;
        const endCharacterOffsetInCell =
            serialized.endCharacterOffsetInCell as number;
        const command = new AssignStoryTextToSalientConceptCommand(
            annotationCellId,
            cellId,
            startCharacterOffsetInCell,
            endCharacterOffsetInCell,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const storyWords = new StoryWordsIterator(story);
            const wordsAssigned = storyWords.rangeBetween(
                this.cellId,
                this.startCharacterOffsetInCell,
                this.endCharacterOffsetInCell,
            );
            const annotation = story.cellWithId(this.annotationCellId);
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
