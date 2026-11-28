import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { BLURB } from "authordoc/cells/blurb_cell";
import { RECAP } from "authordoc/cells/recap_cell";
import { TABLE_OF_CONTENTS } from "authordoc/cells/table_of_contents_cell";
import type { RuntimeCommand } from "./runtime_command";
import { WriteBlurbCommand } from "./write_blurb";
import { WriteStorySoFarCommand } from "./write_story_so_far";
import { WriteTableOfContentsCommand } from "./write_table_of_contents";

export const RUN_ALL = "runAll";

const COMMAND_THAT_WRITES_EACH_CELL_KIND = new Map<
    string,
    (cellId: string) => RuntimeCommand
>([
    [BLURB, (cellId) => new WriteBlurbCommand(cellId)],
    [RECAP, (cellId) => new WriteStorySoFarCommand(cellId)],
    [TABLE_OF_CONTENTS, (cellId) => new WriteTableOfContentsCommand(cellId)],
]);

export class RunAllCommand implements RuntimeCommand {
    static deserialize(): RunAllCommand {
        const command = new RunAllCommand();
        return command;
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const queued: { cellId: string; command: RuntimeCommand }[] = [];
        for (const cell of session.document.cells) {
            const commandThatWritesIt = COMMAND_THAT_WRITES_EACH_CELL_KIND.get(
                cell.kind,
            );
            if (commandThatWritesIt) {
                const command = commandThatWritesIt(cell.uniqueId);
                queued.push({ cellId: cell.uniqueId, command });
            }
        }
        for (const { cellId, command } of queued) {
            if (session.document.cellWithId(cellId)) {
                await command.invoke(session);
            }
        }
    }
}
