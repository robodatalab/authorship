import * as vscode from "vscode";
import {
    authorFileEditorPage,
    whereTheWebviewMayReadFrom,
} from "./author_file_editor_page";
import {
    openAuthorFileEditorSession,
    type AuthorFileEditorSession,
} from "./author_file_editor_session";
import { RevertDocumentCommand } from "./runtime_commands/revert_document";
import { SaveDocumentCommand } from "./runtime_commands/save_document";
import { SaveDocumentAsCommand } from "./runtime_commands/save_document_as";
import { VsCodeCommandExecutor } from "./vscode_command_executor";
import { loadTemplates, watchSettings } from "./settings/file";
import { watchTheAuthorFileForChanges } from "./tools/author_file_watcher";
import { useTemplates } from "./settings/model";

export class AuthorFileEditorProvider implements vscode.CustomEditorProvider<AuthorFileEditorSession> {
    public static readonly viewType = "authorship.authorEditor";

    private readonly edited = new vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<AuthorFileEditorSession>
    >();
    private readonly commandExecutors = new Map<
        string,
        VsCodeCommandExecutor
    >();
    readonly onDidChangeCustomDocument = this.edited.event;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly log: vscode.LogOutputChannel,
    ) {}

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
    ): Promise<AuthorFileEditorSession> {
        const fileToOpen = openContext.backupId
            ? vscode.Uri.parse(openContext.backupId)
            : uri;
        const bytes = await vscode.workspace.fs.readFile(fileToOpen);
        return openAuthorFileEditorSession(
            uri,
            new TextDecoder().decode(bytes),
            this.edited,
        );
    }

    resolveCustomEditor(
        session: AuthorFileEditorSession,
        panel: vscode.WebviewPanel,
    ): void {
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: whereTheWebviewMayReadFrom(
                this.context.extensionUri,
                session.uri,
            ),
        };
        panel.webview.html = authorFileEditorPage(
            panel.webview,
            this.context.extensionUri,
            session.uri,
        );
        session.showOn(panel);
        void session.storyGenerationWorkflow.showWhereItStands();
        const commandExecutor = new VsCodeCommandExecutor(
            session,
            this.log,
        );
        this.commandExecutors.set(session.uri.toString(), commandExecutor);

        const readTemplates = (): void => {
            void loadTemplates(session.uri).then(useTemplates);
        };
        readTemplates();
        const templatesWatcher = watchSettings(session.uri, readTemplates);

        const onMessageFromWebView = panel.webview.onDidReceiveMessage(
            (message: Record<string, unknown>) => {
                commandExecutor.executeMessageReceivedFromWebview(message);
            },
        );

        const watchingTheFile = watchTheAuthorFileForChanges(
            session,
            commandExecutor,
        );

        panel.onDidDispose(() => {
            templatesWatcher.dispose();
            watchingTheFile.dispose();
            onMessageFromWebView.dispose();
            this.commandExecutors.delete(session.uri.toString());
        });
    }

    async saveCustomDocument(session: AuthorFileEditorSession): Promise<void> {
        await this.commandExecutors
            .get(session.uri.toString())
            ?.post(new SaveDocumentCommand());
    }

    async saveCustomDocumentAs(
        session: AuthorFileEditorSession,
        destination: vscode.Uri,
    ): Promise<void> {
        await this.commandExecutors
            .get(session.uri.toString())
            ?.post(new SaveDocumentAsCommand(destination));
    }

    async revertCustomDocument(
        session: AuthorFileEditorSession,
    ): Promise<void> {
        await this.commandExecutors
            .get(session.uri.toString())
            ?.post(new RevertDocumentCommand());
    }

    async backupCustomDocument(
        session: AuthorFileEditorSession,
        context: vscode.CustomDocumentBackupContext,
    ): Promise<vscode.CustomDocumentBackup> {
        await this.commandExecutors
            .get(session.uri.toString())
            ?.post(new SaveDocumentAsCommand(context.destination));
        return {
            id: context.destination.toString(),
            delete: () =>
                void vscode.workspace.fs.delete(context.destination).then(
                    () => undefined,
                    () => undefined,
                ),
        };
    }
}
