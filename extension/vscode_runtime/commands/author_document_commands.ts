import type { WebviewAuthorDocumentCommandCard } from "../../webview/author_editor/AuthorFileEditorCanvas";
import type { AuthorDocumentCommand } from "./author_document_command";
import { AddStoryAnnotationCommand } from "./add_story_annotation";
import { AssignStoryTextToPlotCommand } from "./assign_story_text_to_plot";
import { AssignStoryTextToSalientConceptCommand } from "./assign_story_text_to_salient_concept";
import { CheckProseCommand } from "./check_prose";
import { DeleteCellCommand } from "./delete_cell";
import { DeleteStoryAnnotationCommand } from "./delete_story_annotation";
import { DivideIntoPartsCommand } from "./divide_into_parts";
import { ExportEpubCommand } from "./export_epub";
import { ExportMarkdownCommand } from "./export_markdown";
import {
    FindInTheDocumentCommand,
    ReplaceFindMatchesCommand,
} from "./find_in_the_document";
import { FixProseCommand } from "./fix_prose";
import { FixStyleCommand } from "./fix_style";
import { FoldAllCommand } from "./fold_all";
import { FoldCellCommand } from "./fold_cell";
import { ImportMarkdownCommand } from "./import_markdown";
import { InsertCellCommand } from "./insert_cell";
import { MoveCellDownCommand } from "./move_cell_down";
import { MoveCellUpCommand } from "./move_cell_up";
import { OpenAsTextCommand } from "./open_as_text";
import { RemoveStoryWordRangeCommand } from "./remove_story_word_range";
import { ReplaceCellCommand } from "./replace_cell";
import { RunAllCommand } from "./run_all";
import { WriteBlurbCommand } from "./write_blurb";
import { WriteStorySoFarCommand } from "./write_story_so_far";
import { WriteTableOfContentsCommand } from "./write_table_of_contents";

const AUTHOR_DOCUMENT_COMMANDS: AuthorDocumentCommand[] = [
    new RunAllCommand(authorDocumentCommandThatRunsCellsOfKind),
    new FoldAllCommand(
        "foldAll",
        "codicon codicon-collapse-all",
        "Fold every section away",
        true,
    ),
    new FoldAllCommand(
        "unfoldAll",
        "codicon codicon-expand-all",
        "Unfold every section",
        false,
    ),
    new FoldCellCommand(
        "foldCell",
        "codicon codicon-collapse-all",
        "Fold this section away",
        true,
    ),
    new FoldCellCommand(
        "unfoldCell",
        "codicon codicon-expand-all",
        "Unfold this section",
        false,
    ),
    new MoveCellUpCommand(),
    new MoveCellDownCommand(),
    new DeleteCellCommand(),
    new InsertCellCommand(),
    new ReplaceCellCommand(),
    new FindInTheDocumentCommand(),
    new ReplaceFindMatchesCommand(),
    new AddStoryAnnotationCommand(),
    new DeleteStoryAnnotationCommand(),
    new AssignStoryTextToSalientConceptCommand(),
    new AssignStoryTextToPlotCommand(),
    new RemoveStoryWordRangeCommand(),
    new ImportMarkdownCommand(),
    new ExportMarkdownCommand(),
    new ExportEpubCommand(),
    new DivideIntoPartsCommand(),
    new CheckProseCommand(),
    new FixProseCommand(),
    new FixStyleCommand(),
    new OpenAsTextCommand(),
    new WriteBlurbCommand(),
    new WriteStorySoFarCommand(),
    new WriteTableOfContentsCommand(),
];

export function authorDocumentCommandCards(): WebviewAuthorDocumentCommandCard[] {
    return AUTHOR_DOCUMENT_COMMANDS.filter(
        (command) =>
            command.iconClassName !== "" ||
            command.runsCellsOfKind !== undefined,
    ).map((command) => ({
        commandName: command.commandName,
        buttonGroup: command.buttonGroup,
        iconClassName: command.iconClassName,
        tooltip: command.tooltip,
        drawnWhenTheCellIsFolded: command.drawnWhenTheCellIsFolded,
        runsCellsOfKind: command.runsCellsOfKind,
    }));
}

export function authorDocumentCommandThatRunsCellsOfKind(
    cellKind: string,
): AuthorDocumentCommand | undefined {
    return AUTHOR_DOCUMENT_COMMANDS.find(
        (command) => command.runsCellsOfKind === cellKind,
    );
}

export function authorDocumentCommand(
    commandName: string,
): AuthorDocumentCommand | undefined {
    return AUTHOR_DOCUMENT_COMMANDS.find(
        (command) => command.commandName === commandName,
    );
}
