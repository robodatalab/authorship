import * as vscode from "vscode";

export function authorFileEditorPage(
    webview: vscode.Webview,
    extension: vscode.Uri,
    document: vscode.Uri,
): string {
    const dist = vscode.Uri.joinPath(extension, "dist");
    const script = webview.asWebviewUri(
        vscode.Uri.joinPath(dist, "author_file_editor_view.js"),
    );
    const style = webview.asWebviewUri(
        vscode.Uri.joinPath(dist, "author_file_editor_view.css"),
    );
    const folder = webview.asWebviewUri(vscode.Uri.joinPath(document, ".."));
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

export function whereTheWebviewMayReadFrom(
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
