import type { AuthorFileEditorSession } from "../author_file_editor_session";

export interface AuthorDocumentCommand {
    readonly commandName: string;
    readonly buttonGroup: string;
    readonly iconClassName: string;
    readonly tooltip: string;
    readonly drawnWhenTheCellIsFolded?: boolean;
    readonly runsCellsOfKind?: string;
    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void | Promise<void>;
}
