import * as vscode from "vscode";
import { AuthorDocument } from "./storydoc/model";
import {
    authorDocumentCommand,
    authorDocumentCommandCards,
} from "./commands/author_document_commands";
import {
    authorFileEditorSession,
    closeAuthorFileEditorSession,
    openAuthorFileEditorSession,
} from "./author_file_editor_session";
import { loadTemplates, watchSettings } from "./settings/file";
import { useTemplates } from "./settings/model";

export class AuthorFileEditorProvider implements vscode.CustomEditorProvider<AuthorDocument> {
    public static readonly viewType = "authorship.authorEditor";

    private readonly edited = new vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<AuthorDocument>
    >();
    readonly onDidChangeCustomDocument = this.edited.event;

    constructor(private readonly context: vscode.ExtensionContext) {}

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
    ): Promise<AuthorDocument> {
        const fileToOpen = openContext.backupId
            ? vscode.Uri.parse(openContext.backupId)
            : uri;
        const bytes = await vscode.workspace.fs.readFile(fileToOpen);
        return new AuthorDocument(uri, new TextDecoder().decode(bytes));
    }

    resolveCustomEditor(
        document: AuthorDocument,
        panel: vscode.WebviewPanel,
    ): void {
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: whereTheWebviewMayReadFrom(
                this.context.extensionUri,
                document.uri,
            ),
        };
        panel.webview.html = this.html(panel.webview, document.uri);
        const session = openAuthorFileEditorSession(document, panel);

        const readTemplates = (): void => {
            void loadTemplates(document.uri).then(useTemplates);
        };
        readTemplates();
        const templatesWatcher = watchSettings(document.uri, readTemplates);

        const sendCommandCards = (): void => {
            void panel.webview.postMessage({
                type: "commands",
                commands: authorDocumentCommandCards(),
            });
        };

        const pageSpoke = panel.webview.onDidReceiveMessage(
            (message: {
                type?: string;
                commandName?: string;
                commandArguments?: Record<string, unknown>;
            }) => {
                if (message?.type === "ready") {
                    sendCommandCards();
                    session.sendDocument();
                } else if (message?.type === "invoke" && message.commandName) {
                    void this.runCommand(
                        document,
                        message.commandName,
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

        const fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.Uri.joinPath(document.uri, ".."),
                document.uri.path.split("/").pop() ?? "",
            ),
        );
        const savedElsewhere = fileWatcher.onDidChange(async () => {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            const savedText = new TextDecoder().decode(bytes);
            if (savedText === document.text) {
                return;
            }
            document.fromText(savedText);
            session.sendDocument();
        });

        panel.onDidDispose(() => {
            templatesWatcher.dispose();
            settingsChanged.dispose();
            savedElsewhere.dispose();
            fileWatcher.dispose();
            pageSpoke.dispose();
            closeAuthorFileEditorSession(document);
        });
    }

    async saveCustomDocument(document: AuthorDocument): Promise<void> {
        const text = document.text;
        await vscode.workspace.fs.writeFile(
            document.uri,
            new TextEncoder().encode(text),
        );
        document.fromText(text);
    }

    saveCustomDocumentAs(
        document: AuthorDocument,
        destination: vscode.Uri,
    ): Thenable<void> {
        return vscode.workspace.fs.writeFile(
            destination,
            new TextEncoder().encode(document.text),
        );
    }

    async revertCustomDocument(document: AuthorDocument): Promise<void> {
        const bytes = await vscode.workspace.fs.readFile(document.uri);
        document.fromText(new TextDecoder().decode(bytes));
        authorFileEditorSession(document)?.sendDocument();
    }

    async backupCustomDocument(
        document: AuthorDocument,
        context: vscode.CustomDocumentBackupContext,
    ): Promise<vscode.CustomDocumentBackup> {
        await vscode.workspace.fs.writeFile(
            context.destination,
            new TextEncoder().encode(document.text),
        );
        return {
            id: context.destination.toString(),
            delete: () =>
                void vscode.workspace.fs.delete(context.destination).then(
                    () => undefined,
                    () => undefined,
                ),
        };
    }

    private async runCommand(
        document: AuthorDocument,
        commandName: string,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const before = document.text;
        await authorDocumentCommand(commandName)?.invoke(
            document,
            commandArguments,
        );
        const after = document.text;
        if (after === before) {
            return;
        }
        this.recordEdit(document, before, after);
        authorFileEditorSession(document)?.sendDocument();
    }

    private recordEdit(
        document: AuthorDocument,
        before: string,
        text: string,
    ): void {
        this.edited.fire({
            document,
            label: "Edit",
            undo: () => {
                document.fromText(before);
                authorFileEditorSession(document)?.sendDocument();
            },
            redo: () => {
                document.fromText(text);
                authorFileEditorSession(document)?.sendDocument();
            },
        });
    }

    private html(webview: vscode.Webview, document: vscode.Uri): string {
        const dist = vscode.Uri.joinPath(this.context.extensionUri, "dist");
        const script = webview.asWebviewUri(
            vscode.Uri.joinPath(dist, "author_file_editor_view.js"),
        );
        const style = webview.asWebviewUri(
            vscode.Uri.joinPath(dist, "author_file_editor_view.css"),
        );
        const folder = webview.asWebviewUri(
            vscode.Uri.joinPath(document, ".."),
        );
        const nonce = scriptNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<base href="${folder}/">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${style}" rel="stylesheet">
	<title>Author</title>
</head>
<body>
	<div id="author-file-editor-root"></div>
	<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
    }
}

function whereTheWebviewMayReadFrom(
    extension: vscode.Uri,
    document: vscode.Uri,
): vscode.Uri[] {
    const project = vscode.workspace.getWorkspaceFolder(document);
    return [
        vscode.Uri.joinPath(extension, "media"),
        vscode.Uri.joinPath(extension, "dist"),
        vscode.Uri.joinPath(document, ".."),
        ...(project ? [project.uri] : []),
    ];
}

function scriptNonce(): string {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let character = 0; character < 32; character++) {
        nonce += characters.charAt(
            Math.floor(Math.random() * characters.length),
        );
    }
    return nonce;
}
