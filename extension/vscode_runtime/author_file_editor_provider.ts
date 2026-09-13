import * as vscode from "vscode";
import {
    authorFileEditorPage,
    whereTheWebviewMayReadFrom,
} from "./author_file_editor_page";
import {
    openAuthorFileEditorSession,
    type AuthorFileEditorSession,
} from "./author_file_editor_session";
import {
    ReadTheDocumentBackFromItsFile,
    TheAuthorIsEditingTheCell,
    TheAuthorTypedInTheCell,
    ThePageIsReady,
    WriteTheDocumentTo,
    WriteTheDocumentToItsFile,
} from "./author_file_editor_messages";
import {
    authorDocumentCommand,
    authorDocumentCommandCards,
} from "./commands/author_document_commands";
import { MessageQueueBetweenVscodeAndWebview } from "./message_queue_between_vscode_and_webview";
import { loadTemplates, watchSettings } from "./settings/file";
import { watchTheAuthorFileForChanges } from "./storydoc/author_file_watcher";
import { useTemplates } from "./settings/model";

export class AuthorFileEditorProvider implements vscode.CustomEditorProvider<AuthorFileEditorSession> {
    public static readonly viewType = "authorship.authorEditor";

    private readonly edited = new vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<AuthorFileEditorSession>
    >();
    private readonly documentChangesMessageQueues = new Map<
        string,
        MessageQueueBetweenVscodeAndWebview
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
        const documentChangesMessageQueue =
            new MessageQueueBetweenVscodeAndWebview(this.log);
        documentChangesMessageQueue.addListener(session);
        this.documentChangesMessageQueues.set(
            session.uri.toString(),
            documentChangesMessageQueue,
        );

        const readTemplates = (): void => {
            void loadTemplates(session.uri).then(useTemplates);
        };
        readTemplates();
        const templatesWatcher = watchSettings(session.uri, readTemplates);

        const sendCommandCards = (): void => {
            void panel.webview.postMessage({
                type: "commands",
                commands: authorDocumentCommandCards(),
            });
        };

        const onMessageFromWebView = panel.webview.onDidReceiveMessage(
            (message: {
                type?: string;
                cellId?: string | null;
                commandName?: string;
                commandArguments?: Record<string, unknown>;
                markdown?: string;
            }) => {
                if (message?.type === "typed" && message.cellId) {
                    void documentChangesMessageQueue.post(
                        new TheAuthorTypedInTheCell(
                            message.cellId,
                            message.markdown ?? "",
                        ),
                    );
                } else if (message?.type === "editing") {
                    void documentChangesMessageQueue.post(
                        new TheAuthorIsEditingTheCell(message.cellId ?? null),
                    );
                } else if (message?.type === "ready") {
                    sendCommandCards();
                    void documentChangesMessageQueue.post(new ThePageIsReady());
                } else if (message?.type === "invoke" && message.commandName) {
                    void authorDocumentCommand(message.commandName)?.invoke(
                        session,
                        message.commandArguments ?? {},
                    );
                }
            },
        );

        const settingsChanged = vscode.workspace.onDidChangeConfiguration(
            (changed) => {
                if (changed.affectsConfiguration("authorship")) {
                    sendCommandCards();
                }
            },
        );

        const watchingTheFile = watchTheAuthorFileForChanges(
            session,
            documentChangesMessageQueue,
        );

        panel.onDidDispose(() => {
            templatesWatcher.dispose();
            settingsChanged.dispose();
            watchingTheFile.dispose();
            onMessageFromWebView.dispose();
            this.documentChangesMessageQueues.delete(session.uri.toString());
        });
    }

    async saveCustomDocument(session: AuthorFileEditorSession): Promise<void> {
        await this.documentChangesMessageQueues
            .get(session.uri.toString())
            ?.post(new WriteTheDocumentToItsFile());
    }

    async saveCustomDocumentAs(
        session: AuthorFileEditorSession,
        destination: vscode.Uri,
    ): Promise<void> {
        await this.documentChangesMessageQueues
            .get(session.uri.toString())
            ?.post(new WriteTheDocumentTo(destination));
    }

    async revertCustomDocument(
        session: AuthorFileEditorSession,
    ): Promise<void> {
        await this.documentChangesMessageQueues
            .get(session.uri.toString())
            ?.post(new ReadTheDocumentBackFromItsFile());
    }

    async backupCustomDocument(
        session: AuthorFileEditorSession,
        context: vscode.CustomDocumentBackupContext,
    ): Promise<vscode.CustomDocumentBackup> {
        await this.documentChangesMessageQueues
            .get(session.uri.toString())
            ?.post(new WriteTheDocumentTo(context.destination));
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
