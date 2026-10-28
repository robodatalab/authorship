import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import { StoryWordsIterator } from "authordoc/iterators/story_words_iterator";
import type { AuthorDocumentCommand } from "./author_document_command";

/** Makes the selected words the story text that tells one event of a plot. */
export class AssignStoryTextToPlotEventCommand implements AuthorDocumentCommand {
    readonly commandName = "assignStoryTextToPlotEvent";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const nodeId = commandArguments.nodeId as string;
        session.changeTheDocument((story) => {
            const plotIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const storyWords = new StoryWordsIterator(story);
            const wordsAssigned = storyWords.rangeBetween(
                commandArguments.cellId as string,
                commandArguments.startCharacterOffsetInCell as number,
                commandArguments.endCharacterOffsetInCell as number,
            );
            const plot = story.cells[plotIndex];
            if (!(plot instanceof PlotCell) || wordsAssigned === null) {
                return;
            }
            const event = plot.nodes.find((node) => node.nodeId === nodeId);
            if (event === undefined) {
                return;
            }
            const eventTold = event.withStoryWordRange(wordsAssigned);
            story.cells[plotIndex] = plot.withNode(eventTold);
        });
    }
}
