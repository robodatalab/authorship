import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    ADD_CHARACTER_TO_PLOT,
    AddCharacterToPlotCommand,
} from "./add_character_to_plot";
import {
    ADD_CHARACTER_TO_PLOT_EVENT,
    AddCharacterToPlotEventCommand,
} from "./add_character_to_plot_event";
import {
    ADD_CONCEPT_TO_CHARACTER,
    AddConceptToCharacterCommand,
} from "./add_concept_to_character";
import {
    ADD_CONCEPT_TO_PLOT,
    AddConceptToPlotCommand,
} from "./add_concept_to_plot";
import { ADD_EDGE_TO_PLOT, AddEdgeToPlotCommand } from "./add_edge_to_plot";
import { ADD_EVENT_TO_PLOT, AddEventToPlotCommand } from "./add_event_to_plot";
import {
    ANSWER_THE_STORY_GENERATION,
    AnswerTheStoryGenerationCommand,
} from "./answer_the_story_generation";
import {
    ASSIGN_STORY_TEXT_TO_PLOT,
    AssignStoryTextToPlotCommand,
} from "./assign_story_text_to_plot";
import {
    ASSIGN_STORY_TEXT_TO_PLOT_EVENT,
    AssignStoryTextToPlotEventCommand,
} from "./assign_story_text_to_plot_event";
import {
    ASSIGN_STORY_TEXT_TO_SALIENT_CONCEPT,
    AssignStoryTextToSalientConceptCommand,
} from "./assign_story_text_to_salient_concept";
import { CHANGE_PLOT_EVENT, ChangePlotEventCommand } from "./change_plot_event";
import { CHECK_PROSE, CheckProseCommand } from "./check_prose";
import { DELETE_CELL, DeleteCellCommand } from "./delete_cell";
import { DIVIDE_INTO_PARTS, DivideIntoPartsCommand } from "./divide_into_parts";
import { EXPORT_EPUB, ExportEpubCommand } from "./export_epub";
import { EXPORT_MARKDOWN, ExportMarkdownCommand } from "./export_markdown";
import {
    FIND_IN_THE_DOCUMENT,
    FindInTheDocumentCommand,
    REPLACE_FIND_MATCHES,
    ReplaceFindMatchesCommand,
} from "./find_in_the_document";
import { FIX_PROSE, FixProseCommand } from "./fix_prose";
import { FIX_STYLE, FixStyleCommand } from "./fix_style";
import { FOLD_ALL, FoldAllCommand, UNFOLD_ALL } from "./fold_all";
import { FOLD_CELL, FoldCellCommand, UNFOLD_CELL } from "./fold_cell";
import { GENERATE_STORY, GenerateStoryCommand } from "./generate_story";
import { IMPORT_MARKDOWN, ImportMarkdownCommand } from "./import_markdown";
import { INSERT_CELL, InsertCellCommand } from "./insert_cell";
import {
    INVOKE_NAMED_COMMAND,
    InvokeNamedCommand,
} from "./invoke_named_command";
import { MOVE_CELL, MoveCellCommand } from "./move_cell";
import { MOVE_NODE_IN_PLOT, MoveNodeInPlotCommand } from "./move_node_in_plot";
import { MOVE_PLACE, MovePlaceCommand } from "./move_place";
import { OPEN_AS_TEXT, OpenAsTextCommand } from "./open_as_text";
import {
    QUIT_THE_STORY_GENERATION,
    QuitTheStoryGenerationCommand,
} from "./quit_the_story_generation";
import { REDESCRIBE_PLOT, RedescribePlotCommand } from "./redescribe_plot";
import {
    REMOVE_CHARACTER_FROM_PLOT,
    RemoveCharacterFromPlotCommand,
} from "./remove_character_from_plot";
import {
    REMOVE_CHARACTER_FROM_PLOT_EVENT,
    RemoveCharacterFromPlotEventCommand,
} from "./remove_character_from_plot_event";
import {
    REMOVE_CONCEPT_FROM_CHARACTER,
    RemoveConceptFromCharacterCommand,
} from "./remove_concept_from_character";
import {
    REMOVE_CONCEPT_FROM_PLOT,
    RemoveConceptFromPlotCommand,
} from "./remove_concept_from_plot";
import {
    REMOVE_EDGE_FROM_PLOT,
    RemoveEdgeFromPlotCommand,
} from "./remove_edge_from_plot";
import {
    REMOVE_NODE_FROM_PLOT,
    RemoveNodeFromPlotCommand,
} from "./remove_node_from_plot";
import {
    REMOVE_REFERENCE_FROM_SALIENT_CONCEPT,
    RemoveReferenceFromSalientConceptCommand,
} from "./remove_reference_from_salient_concept";
import {
    REMOVE_STORY_TEXT_FROM_PLOT_EVENT,
    RemoveStoryTextFromPlotEventCommand,
} from "./remove_story_text_from_plot_event";
import { REPLACE_CELL, ReplaceCellCommand } from "./replace_cell";
import {
    REVIEW_THE_SUGGESTION,
    ReviewTheSuggestionCommand,
} from "./review_the_suggestion";
import { RUN_ALL, RunAllCommand } from "./run_all";
import { SEND_DOCUMENT, SendDocumentCommand } from "./send_document";
import {
    SET_CELL_BEING_EDITED,
    SetCellBeingEditedCommand,
} from "./set_cell_being_edited";
import { SHOW_WORD_RANGE, ShowWordRangeCommand } from "./show_word_range";
import { TYPE_IN_CELL, TypeInCellCommand } from "./type_in_cell";
import { WRITE_BLURB, WriteBlurbCommand } from "./write_blurb";
import {
    WRITE_STORY_SO_FAR,
    WriteStorySoFarCommand,
} from "./write_story_so_far";
import {
    WRITE_TABLE_OF_CONTENTS,
    WriteTableOfContentsCommand,
} from "./write_table_of_contents";

export interface RuntimeCommand {
    invoke(session: AuthorFileEditorSession): void | Promise<void>;
}

const RUNTIME_COMMAND_DESERIALIZERS = new Map<
    string,
    (serialized: Record<string, unknown>) => RuntimeCommand
>([
    [ADD_CHARACTER_TO_PLOT, AddCharacterToPlotCommand.deserialize],
    [ADD_CHARACTER_TO_PLOT_EVENT, AddCharacterToPlotEventCommand.deserialize],
    [ADD_CONCEPT_TO_CHARACTER, AddConceptToCharacterCommand.deserialize],
    [ADD_CONCEPT_TO_PLOT, AddConceptToPlotCommand.deserialize],
    [ADD_EDGE_TO_PLOT, AddEdgeToPlotCommand.deserialize],
    [ADD_EVENT_TO_PLOT, AddEventToPlotCommand.deserialize],
    [ANSWER_THE_STORY_GENERATION, AnswerTheStoryGenerationCommand.deserialize],
    [ASSIGN_STORY_TEXT_TO_PLOT, AssignStoryTextToPlotCommand.deserialize],
    [
        ASSIGN_STORY_TEXT_TO_PLOT_EVENT,
        AssignStoryTextToPlotEventCommand.deserialize,
    ],
    [
        ASSIGN_STORY_TEXT_TO_SALIENT_CONCEPT,
        AssignStoryTextToSalientConceptCommand.deserialize,
    ],
    [CHANGE_PLOT_EVENT, ChangePlotEventCommand.deserialize],
    [CHECK_PROSE, CheckProseCommand.deserialize],
    [DELETE_CELL, DeleteCellCommand.deserialize],
    [DIVIDE_INTO_PARTS, DivideIntoPartsCommand.deserialize],
    [EXPORT_EPUB, ExportEpubCommand.deserialize],
    [EXPORT_MARKDOWN, ExportMarkdownCommand.deserialize],
    [FIND_IN_THE_DOCUMENT, FindInTheDocumentCommand.deserialize],
    [REPLACE_FIND_MATCHES, ReplaceFindMatchesCommand.deserialize],
    [FIX_PROSE, FixProseCommand.deserialize],
    [FIX_STYLE, FixStyleCommand.deserialize],
    [FOLD_ALL, FoldAllCommand.deserializeFoldAll],
    [UNFOLD_ALL, FoldAllCommand.deserializeUnfoldAll],
    [FOLD_CELL, FoldCellCommand.deserializeFoldCell],
    [UNFOLD_CELL, FoldCellCommand.deserializeUnfoldCell],
    [GENERATE_STORY, GenerateStoryCommand.deserialize],
    [IMPORT_MARKDOWN, ImportMarkdownCommand.deserialize],
    [INSERT_CELL, InsertCellCommand.deserialize],
    [INVOKE_NAMED_COMMAND, deserializeInvokeNamedCommand],
    [MOVE_CELL, MoveCellCommand.deserialize],
    [MOVE_NODE_IN_PLOT, MoveNodeInPlotCommand.deserialize],
    [MOVE_PLACE, MovePlaceCommand.deserialize],
    [OPEN_AS_TEXT, OpenAsTextCommand.deserialize],
    [QUIT_THE_STORY_GENERATION, QuitTheStoryGenerationCommand.deserialize],
    [REDESCRIBE_PLOT, RedescribePlotCommand.deserialize],
    [REMOVE_CHARACTER_FROM_PLOT, RemoveCharacterFromPlotCommand.deserialize],
    [
        REMOVE_CHARACTER_FROM_PLOT_EVENT,
        RemoveCharacterFromPlotEventCommand.deserialize,
    ],
    [
        REMOVE_CONCEPT_FROM_CHARACTER,
        RemoveConceptFromCharacterCommand.deserialize,
    ],
    [REMOVE_CONCEPT_FROM_PLOT, RemoveConceptFromPlotCommand.deserialize],
    [REMOVE_EDGE_FROM_PLOT, RemoveEdgeFromPlotCommand.deserialize],
    [REMOVE_NODE_FROM_PLOT, RemoveNodeFromPlotCommand.deserialize],
    [
        REMOVE_REFERENCE_FROM_SALIENT_CONCEPT,
        RemoveReferenceFromSalientConceptCommand.deserialize,
    ],
    [
        REMOVE_STORY_TEXT_FROM_PLOT_EVENT,
        RemoveStoryTextFromPlotEventCommand.deserialize,
    ],
    [REPLACE_CELL, ReplaceCellCommand.deserialize],
    [REVIEW_THE_SUGGESTION, ReviewTheSuggestionCommand.deserialize],
    [RUN_ALL, RunAllCommand.deserialize],
    [SEND_DOCUMENT, SendDocumentCommand.deserialize],
    [SET_CELL_BEING_EDITED, SetCellBeingEditedCommand.deserialize],
    [SHOW_WORD_RANGE, ShowWordRangeCommand.deserialize],
    [TYPE_IN_CELL, TypeInCellCommand.deserialize],
    [WRITE_BLURB, WriteBlurbCommand.deserialize],
    [WRITE_STORY_SO_FAR, WriteStorySoFarCommand.deserialize],
    [WRITE_TABLE_OF_CONTENTS, WriteTableOfContentsCommand.deserialize],
]);

export function deserializeNamedRuntimeCommand(
    commandName: string,
    serialized: Record<string, unknown>,
): RuntimeCommand {
    const deserialize = RUNTIME_COMMAND_DESERIALIZERS.get(commandName);
    if (deserialize === undefined) {
        throw new Error(`No runtime command has the type "${commandName}"`);
    }
    const command = deserialize(serialized);
    return command;
}

function deserializeInvokeNamedCommand(
    serialized: Record<string, unknown>,
): InvokeNamedCommand {
    const commandName = serialized.commandName as string;
    const commandArguments = serialized.commandArguments as Record<
        string,
        unknown
    >;
    const command = deserializeNamedRuntimeCommand(
        commandName,
        commandArguments,
    );
    const invokeNamedCommand = new InvokeNamedCommand(command);
    return invokeNamedCommand;
}

export function deserializeRuntimeCommand(
    serialized: Record<string, unknown>,
): RuntimeCommand {
    const type = serialized.type as string;
    const command = deserializeNamedRuntimeCommand(type, serialized);
    return command;
}
