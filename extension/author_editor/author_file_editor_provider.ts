import * as vscode from "vscode";

export class AuthorFileEditorProvider
    implements vscode.CustomTextEditorProvider
{
    public static readonly viewType = "authorship.authorEditor";

    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveCustomTextEditor(
        document: vscode.TextDocument,
        panel: vscode.WebviewPanel,
    ): void {
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: assetRoots(
                this.context.extensionUri,
                document.uri,
            ),
        };
        panel.webview.html = this.html(panel.webview);

        const sendDocument = (): void => {
            void panel.webview.postMessage({
                type: "document",
                text: document.getText(),
            });
        };

        const documentChanged = vscode.workspace.onDidChangeTextDocument(
            (event) => {
                if (event.document.uri.toString() === document.uri.toString()) {
                    sendDocument();
                }
            },
        );

        const webviewSpoke = panel.webview.onDidReceiveMessage(
            (message: { type?: string; text?: string }) => {
                if (message?.type === "ready") {
                    sendDocument();
                } else if (
                    message?.type === "save" &&
                    message.text !== undefined
                ) {
                    void vscode.workspace.fs.writeFile(
                        document.uri,
                        new TextEncoder().encode(message.text),
                    );
                }
            },
        );

        panel.onDidDispose(() => {
            documentChanged.dispose();
            webviewSpoke.dispose();
        });
    }

    private html(webview: vscode.Webview): string {
        const dist = vscode.Uri.joinPath(this.context.extensionUri, "dist");
        const script = webview.asWebviewUri(
            vscode.Uri.joinPath(dist, "author_file_editor_view.js"),
        );
        const style = webview.asWebviewUri(
            vscode.Uri.joinPath(dist, "author_file_editor_view.css"),
        );
        const nonce = nonceString();

        return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
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
