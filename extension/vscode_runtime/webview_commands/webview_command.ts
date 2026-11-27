import { UPDATE_CELLS, UpdateCellsWebviewCommand } from "./update_cells";
import {
    SET_CELLS_BEING_WRITTEN,
    SetCellsBeingWrittenWebviewCommand,
} from "./set_cells_being_written";
import {
    SET_COMMAND_CARDS,
    SetCommandCardsWebviewCommand,
} from "./set_command_cards";
import { SET_ALL_CELLS, SetAllCellsWebviewCommand } from "./set_all_cells";
import {
    SET_FIND_MATCHES,
    SetFindMatchesWebviewCommand,
} from "./set_find_matches";
import {
    SET_PROSE_ERRORS,
    SetProseErrorsWebviewCommand,
} from "./set_prose_errors";
import {
    SET_STORY_GENERATION,
    SetStoryGenerationWebviewCommand,
} from "./set_story_generation";
import {
    SET_STORY_TEXT_SHOWN,
    SetStoryTextShownWebviewCommand,
} from "./set_story_text_shown";
import {
    SET_SUGGESTIONS,
    SetSuggestionsWebviewCommand,
} from "./set_suggestions";
import type { WebviewRenderState } from "./webview_render_state";
import {
    SET_WORD_COUNTS,
    SetWordCountsWebviewCommand,
} from "./set_word_counts";

export interface WebviewCommand {
    serialize(): Record<string, unknown>;
    integrate(state: WebviewRenderState): WebviewRenderState;
}

const WEBVIEW_COMMAND_DESERIALIZERS = new Map<
    string,
    (serialized: Record<string, unknown>) => WebviewCommand
>([
    [SET_ALL_CELLS, SetAllCellsWebviewCommand.deserialize],
    [UPDATE_CELLS, UpdateCellsWebviewCommand.deserialize],
    [SET_COMMAND_CARDS, SetCommandCardsWebviewCommand.deserialize],
    [SET_PROSE_ERRORS, SetProseErrorsWebviewCommand.deserialize],
    [SET_STORY_TEXT_SHOWN, SetStoryTextShownWebviewCommand.deserialize],
    [SET_FIND_MATCHES, SetFindMatchesWebviewCommand.deserialize],
    [SET_CELLS_BEING_WRITTEN, SetCellsBeingWrittenWebviewCommand.deserialize],
    [SET_WORD_COUNTS, SetWordCountsWebviewCommand.deserialize],
    [SET_STORY_GENERATION, SetStoryGenerationWebviewCommand.deserialize],
    [SET_SUGGESTIONS, SetSuggestionsWebviewCommand.deserialize],
]);

export function deserializeWebviewCommand(
    serialized: Record<string, unknown>,
): WebviewCommand {
    const type = serialized.type as string;
    const deserialize = WEBVIEW_COMMAND_DESERIALIZERS.get(type);
    if (!deserialize) {
        throw new Error(`No webview command has the type "${type}"`);
    }
    const command = deserialize(serialized);
    return command;
}
