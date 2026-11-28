import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell, PlotNode } from "authordoc/cells/plot_cell";
import { StoryWordsIterator } from "authordoc/iterators/story_words_iterator";
import type { RuntimeCommand } from "./runtime_command";

export const ASSIGN_STORY_TEXT_TO_PLOT = "assignStoryTextToPlot";

export class AssignStoryTextToPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly cellId: string,
        private readonly startCharacterOffsetInCell: number,
        private readonly endCharacterOffsetInCell: number,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AssignStoryTextToPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const cellId = serialized.cellId as string;
        const startCharacterOffsetInCell =
            serialized.startCharacterOffsetInCell as number;
        const endCharacterOffsetInCell =
            serialized.endCharacterOffsetInCell as number;
        const command = new AssignStoryTextToPlotCommand(
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
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell) || wordsAssigned === null) {
                return story;
            }
            if (
                plot.nodes.some(
                    (node) =>
                        node.storyWordRange?.firstWord ===
                            wordsAssigned.firstWord &&
                        node.storyWordRange?.lastWord === wordsAssigned.lastWord,
                )
            ) {
                return story;
            }
            const nodeId = crypto.randomUUID();
            const nodeAdded = new PlotNode(nodeId, wordsAssigned);
            const nodes = [...plot.nodes, nodeAdded];
            const plotTold = plot.withNodes(nodes);
            const storyChanged = story.withCell(plotTold);
            return storyChanged;
        });
    }
}
