import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell, PlotNode } from "../../library/storydoc/cells/plot_cell";
import { StoryWordsIterator } from "../../library/storydoc/iterators/story_words_iterator";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AssignStoryTextToPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "assignStoryTextToPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
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
            if (
                plot.nodes.some(
                    (node) =>
                        node.storyWordRange.firstWord ===
                            wordsAssigned.firstWord &&
                        node.storyWordRange.lastWord === wordsAssigned.lastWord,
                )
            ) {
                return;
            }
            const nodeId = crypto.randomUUID();
            const nodeAdded = new PlotNode(nodeId, wordsAssigned);
            const nodes = [...plot.nodes, nodeAdded];
            story.cells[plotIndex] = new PlotCell(
                plot.title,
                nodes,
                plot.edges,
                plot.source,
                plot.folded,
                plot.at,
                plot.uniqueId,
            );
        });
    }
}
