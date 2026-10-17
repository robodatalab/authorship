import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    STORY_WORD_RANGES,
    storyWordRangeBetween,
    storyWordRangesAsTheyAreWritten,
    storyWordRangesOf,
} from "../storydoc/story_words";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AssignStoryTextToThePlotCommand implements AuthorDocumentCommand {
    readonly commandName = "assignStoryTextToThePlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(commandArguments.plotCellId as string);
            const wordsAssigned = storyWordRangeBetween(
                story.cells,
                commandArguments.cellId as string,
                commandArguments.startCharacterOffsetInCell as number,
                commandArguments.endCharacterOffsetInCell as number,
            );
            if (plot === undefined || wordsAssigned === null) {
                return;
            }
            const trajectory = storyWordRangesOf(plot);
            if (
                trajectory.some(
                    (range) =>
                        range.firstWord === wordsAssigned.firstWord &&
                        range.lastWord === wordsAssigned.lastWord,
                )
            ) {
                return;
            }
            const trajectoryAsItIsWritten = storyWordRangesAsTheyAreWritten([
                ...trajectory,
                wordsAssigned,
            ]);
            plot.replaceAttribute(STORY_WORD_RANGES, trajectoryAsItIsWritten);
        });
    }
}
