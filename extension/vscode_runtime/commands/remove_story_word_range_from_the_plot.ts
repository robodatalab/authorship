import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    STORY_WORD_RANGES,
    storyWordRangesAsTheyAreWritten,
    storyWordRangesOf,
} from "../storydoc/story_words";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveStoryWordRangeFromThePlotCommand
    implements AuthorDocumentCommand
{
    readonly commandName = "removeStoryWordRangeFromThePlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(commandArguments.plotCellId as string);
            if (plot === undefined) {
                return;
            }
            const trajectoryKept = storyWordRangesOf(plot).filter(
                (range) =>
                    range.firstWord !== commandArguments.firstWord ||
                    range.lastWord !== commandArguments.lastWord,
            );
            const trajectoryAsItIsWritten =
                storyWordRangesAsTheyAreWritten(trajectoryKept);
            plot.replaceAttribute(STORY_WORD_RANGES, trajectoryAsItIsWritten);
        });
    }
}
