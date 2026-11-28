import type { WebviewAuthorDocumentCommandCard } from "../../webview/author_editor/AuthorFileEditorCanvas";
import { AUTHOR_FILE_EDITOR_COMMAND_CARDS } from "../../webview/author_editor/author_file_editor_command_cards";
import type { ProseCheckError } from "../runtime_commands/check_prose";
import type { AuthorFileEditorFindMatch } from "../runtime_commands/find_in_the_document";
import type { StoryGeneration } from "../story_generation/story_generation";
import type { Cell } from "authordoc/cells/cell";
import type { StoryTextSpan } from "authordoc/iterators/story_words_iterator";
import type { Suggestion } from "authordoc/suggestion";

export class WebviewRenderState {
    readonly cells: Cell[] = [];
    readonly timesTheHostWroteEachCell: Record<string, number> = {};
    readonly commands: WebviewAuthorDocumentCommandCard[] =
        AUTHOR_FILE_EDITOR_COMMAND_CARDS;
    readonly proseErrors: ProseCheckError[] = [];
    readonly storyTextShown: StoryTextSpan | null = null;
    readonly findMatches: AuthorFileEditorFindMatch[] = [];
    readonly cellsBeingWritten: Record<string, number> = {};
    readonly wordsInEverySection: Record<string, number> = {};
    readonly wordsInTheDocument: number = 0;
    readonly storyGeneration: StoryGeneration | null = null;
    readonly suggestions: Suggestion[] = [];

    with(changed: Partial<WebviewRenderState>): WebviewRenderState {
        const newState = Object.assign(new WebviewRenderState(), this, changed);
        return newState;
    }

    incrementCellRevisions(cells: readonly Cell[]): Record<string, number> {
        const timesTheHostWroteEachCell = { ...this.timesTheHostWroteEachCell };
        for (const cell of cells) {
            const timesBefore = timesTheHostWroteEachCell[cell.uniqueId] ?? 0;
            timesTheHostWroteEachCell[cell.uniqueId] = timesBefore + 1;
        }
        return timesTheHostWroteEachCell;
    }
}
