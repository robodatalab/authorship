import * as vscode from "vscode";
import { AuthorDocument } from "./storydoc/model";
import {
    authorDocumentCommand,
    authorDocumentCommandsToDraw,
} from "./commands/author_document_commands";

export class AuthorFileEditorProvider implements vscode.CustomEditorProvider<AuthorDocument> {
    public static readonly viewType = "authorship.authorEditor";

    private readonly edited = new vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<AuthorDocument>
    >();
    readonly onDidChangeCustomDocument = this.edited.event;

    private readonly panelsByDocument = new Map<string, vscode.WebviewPanel>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
    ): Promise<AuthorDocument> {
        const from = openContext.backupId
            ? vscode.Uri.parse(openContext.backupId)
            : uri;
        const bytes = await vscode.workspace.fs.readFile(from);
        return new AuthorDocument(uri, new TextDecoder().decode(bytes));
    }

    resolveCustomEditor(
        document: AuthorDocument,
        panel: vscode.WebviewPanel,
    ): void {
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: assetRoots(
                this.context.extensionUri,
                document.uri,
            ),
        };
        panel.webview.html = this.html(panel.webview, document.uri);
        this.panelsByDocument.set(document.uri.toString(), panel);

        const webviewSpoke = panel.webview.onDidReceiveMessage(
            (message: {
                type?: string;
                command?: string;
                payload?: Record<string, unknown>;
            }) => {
                if (message?.type === "ready") {
                    this.sendCommands(document);
                    this.sendDocument(document);
                } else if (message?.type === "invoke" && message.command) {
                    this.runCommand(
                        document,
                        message.command,
                        message.payload ?? {},
                    );
                }
            },
        );

        const fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.Uri.joinPath(document.uri, ".."),
                document.uri.path.split("/").pop() ?? "",
            ),
        );
        const writtenElsewhere = fileWatcher.onDidChange(async () => {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            const text = new TextDecoder().decode(bytes);
            if (text === document.text) {
                return;
            }
            document.fromText(text);
            this.sendDocument(document);
        });

        panel.onDidDispose(() => {
            writtenElsewhere.dispose();
            fileWatcher.dispose();
            webviewSpoke.dispose();
            this.panelsByDocument.delete(document.uri.toString());
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
            new TextEncoder().encode(document.toText()),
        );
    }

    async revertCustomDocument(document: AuthorDocument): Promise<void> {
        const bytes = await vscode.workspace.fs.readFile(document.uri);
        document.fromText(new TextDecoder().decode(bytes));
        this.sendDocument(document);
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

    private runCommand(
        document: AuthorDocument,
        command: string,
        payload: Record<string, unknown>,
    ): void {
        const before = document.text;
        authorDocumentCommand(command)?.invoke(document, payload);
        const after = document.text;
        if (after === before) {
            return;
        }
        document.fromText(before);
        this.recordEdit(document, after);
        this.sendDocument(document);
    }

    private recordEdit(document: AuthorDocument, text: string): void {
        const before = document.text;
        document.fromText(text);
        this.edited.fire({
            document,
            label: "Edit",
            undo: () => {
                document.fromText(before);
                this.sendDocument(document);
            },
            redo: () => {
                document.fromText(text);
                this.sendDocument(document);
            },
        });
    }

    private sendCommands(document: AuthorDocument): void {
        void this.panelsByDocument
            .get(document.uri.toString())
            ?.webview.postMessage({
                type: "commands",
                commands: authorDocumentCommandsToDraw().map((command) => ({
                    name: command.name,
                    category: command.category,
                    iconClassName: command.iconClassName,
                    tooltip: command.tooltip,
                    visibleWhen: command.visibleWhen,
                })),
            });
    }

    private sendDocument(document: AuthorDocument): void {
        void this.panelsByDocument
            .get(document.uri.toString())
            ?.webview.postMessage({
                type: "document",
                cells: document.cells.map((cell) => ({
                    kind: cell.kind,
                    source: cell.source,
                    attrs: cell.attrs,
                })),
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
        const nonce = nonceString();

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

function assetRoots(extension: vscode.Uri, document: vscode.Uri): vscode.Uri[] {
    const project = vscode.workspace.getWorkspaceFolder(document);
    return [
        vscode.Uri.joinPath(extension, "media"),
        vscode.Uri.joinPath(extension, "dist"),
        vscode.Uri.joinPath(document, ".."),
        ...(project ? [project.uri] : []),
    ];
}

function nonceString(): string {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < 32; i++) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}
