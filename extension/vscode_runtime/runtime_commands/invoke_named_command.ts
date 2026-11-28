import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export const INVOKE_NAMED_COMMAND = "invoke";

export class InvokeNamedCommand implements RuntimeCommand {
    constructor(private readonly command: RuntimeCommand) {}

    invoke(session: AuthorFileEditorSession): void {
        void this.command.invoke(session);
    }
}
