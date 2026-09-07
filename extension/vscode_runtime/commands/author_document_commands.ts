import type { WebviewAuthorDocumentCommandCard } from "../../webview/author_editor/AuthorFileEditorCanvas";
import type { AuthorDocumentCommand } from "./author_document_command";
import { CheckProseCommand } from "./check_prose";
import { DeleteCellCommand } from "./delete_cell";
import { DivideIntoPartsCommand } from "./divide_into_parts";
import { ExportEpubCommand } from "./export_epub";
import { ExportMarkdownCommand } from "./export_markdown";
import { FixProseCommand } from "./fix_prose";
import { FoldCellCommand } from "./fold_cell";
import { ImportMarkdownCommand } from "./import_markdown";
import { InsertCellCommand } from "./insert_cell";
import { MoveCellDownCommand } from "./move_cell_down";
import { MoveCellUpCommand } from "./move_cell_up";
import { OpenAsTextCommand } from "./open_as_text";
import { ReplaceAttributeCommand } from "./replace_attribute";
import { ReplaceMarkdownCommand } from "./replace_markdown";
import { WriteBlurbCommand } from "./write_blurb";
import { WriteStorySoFarCommand } from "./write_story_so_far";
import { WriteTableOfContentsCommand } from "./write_table_of_contents";

const AUTHOR_DOCUMENT_COMMANDS: AuthorDocumentCommand[] = [
    new FoldCellCommand(
        "foldCell",
        "codicon codicon-fold-up",
        "Fold this section away",
        true,
    ),
    new FoldCellCommand(
        "unfoldCell",
        "codicon codicon-fold-down",
        "Unfold this section",
        false,
    ),
    new MoveCellUpCommand(),
    new MoveCellDownCommand(),
    new DeleteCellCommand(),
    new InsertCellCommand(),
    new ReplaceMarkdownCommand(),
    new ReplaceAttributeCommand(),
    new ImportMarkdownCommand(),
    new ExportMarkdownCommand(),
    new ExportEpubCommand(),
    new DivideIntoPartsCommand(),
    new CheckProseCommand(),
    new FixProseCommand(),
    new OpenAsTextCommand(),
    new WriteBlurbCommand(),
    new WriteStorySoFarCommand(),
    new WriteTableOfContentsCommand(),
];

export function authorDocumentCommandCards(): WebviewAuthorDocumentCommandCard[] {
    return AUTHOR_DOCUMENT_COMMANDS.filter(
        (command) => command.iconClassName !== "",
    ).map((command) => ({
        commandName: command.commandName,
        buttonGroup: command.buttonGroup,
        iconClassName: command.iconClassName,
        tooltip: command.tooltip,
        drawnWhenCellAttributeIs: command.drawnWhenCellAttributeIs,
    }));
}

export function authorDocumentCommand(
    commandName: string,
): AuthorDocumentCommand | undefined {
    return AUTHOR_DOCUMENT_COMMANDS.find(
        (command) => command.commandName === commandName,
    );
}
