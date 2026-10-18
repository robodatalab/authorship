import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    STORY_WORD_RANGES,
    storyWordRangesAsTheyAreWritten,
    storyWordRangesOf,
} from "../storydoc/story_words";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveStoryWordRangeCommand implements AuthorDocumentCommand {
    readonly commandName = "removeStoryWordRange";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) => {
            const annotation = story.cellWithId(
                commandArguments.annotationCellId as string,
            );
            if (annotation === undefined) {
                return;
            }
            const rangesKept = storyWordRangesOf(annotation).filter(
                (range) =>
                    range.firstWord !== commandArguments.firstWord ||
                    range.lastWord !== commandArguments.lastWord,
            );
            annotation.replaceAttribute(
                STORY_WORD_RANGES,
                storyWordRangesAsTheyAreWritten(rangesKept),
            );
        });
    }
}
