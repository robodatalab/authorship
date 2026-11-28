import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import { StoryWordsIterator } from "authordoc/iterators/story_words_iterator";
import type { RuntimeCommand } from "./runtime_command";

export const ASSIGN_STORY_TEXT_TO_PLOT_EVENT = "assignStoryTextToPlotEvent";

/** Makes the selected words the story text that tells one event of a plot. */
export class AssignStoryTextToPlotEventCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly nodeId: string,
        private readonly cellId: string,
        private readonly startCharacterOffsetInCell: number,
        private readonly endCharacterOffsetInCell: number,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AssignStoryTextToPlotEventCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const nodeId = serialized.nodeId as string;
        const cellId = serialized.cellId as string;
        const startCharacterOffsetInCell =
            serialized.startCharacterOffsetInCell as number;
        const endCharacterOffsetInCell =
            serialized.endCharacterOffsetInCell as number;
        const command = new AssignStoryTextToPlotEventCommand(
            annotationCellId,
            nodeId,
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
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell) || wordsAssigned === null) {
                return story;
            }
            const event = plot.nodes.find(
                (node) => node.nodeId === this.nodeId,
            );
            if (event === undefined) {
                return story;
            }
            const eventTold = event.withStoryWordRange(wordsAssigned);
            const plotTold = plot.withNode(eventTold);
            const storyChanged = story.withCell(plotTold);
            return storyChanged;
        });
    }
}
