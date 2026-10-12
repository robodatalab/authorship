import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    STORY_WORD_RANGES,
    storyWordRangeBetween,
    storyWordRangesAsTheyAreWritten,
    storyWordRangesOf,
} from "../storydoc/story_words";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AssignStoryTextCommand implements AuthorDocumentCommand {
    readonly commandName = "assignStoryText";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) => {
            const concept = story.cellWithId(
                commandArguments.conceptCellId as string,
            );
            const wordsAssigned = storyWordRangeBetween(
                story.cells,
                commandArguments.cellId as string,
                commandArguments.startCharacterOffsetInCell as number,
                commandArguments.endCharacterOffsetInCell as number,
            );
            if (concept === undefined || wordsAssigned === null) {
                return;
            }
            const rangesItHolds = storyWordRangesOf(concept);
            if (
                rangesItHolds.some(
                    (range) =>
                        range.firstWord === wordsAssigned.firstWord &&
                        range.lastWord === wordsAssigned.lastWord,
                )
            ) {
                return;
            }
            concept.replaceAttribute(
                STORY_WORD_RANGES,
                storyWordRangesAsTheyAreWritten([
                    ...rangesItHolds,
                    wordsAssigned,
                ]),
            );
        });
    }
}
