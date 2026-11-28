import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { RuntimeCommand } from "./runtime_command";

export const REVIEW_THE_SUGGESTION = "reviewTheSuggestion";

export class ReviewTheSuggestionCommand implements RuntimeCommand {
    constructor(
        private readonly cellId: string,
        private readonly verdict: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): ReviewTheSuggestionCommand {
        const cellId = serialized.cellId as string;
        const verdict = serialized.verdict as string;
        const command = new ReviewTheSuggestionCommand(cellId, verdict);
        return command;
    }

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        if (this.verdict === "accept") {
            session.acceptTheSuggestion(this.cellId);
        } else {
            session.rejectTheSuggestion(this.cellId);
        }
        await session.writeTheDocumentToItsFile();
    }
}
