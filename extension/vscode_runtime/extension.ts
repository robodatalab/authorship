// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { AuthorFileEditorProvider } from "./author_file_editor_provider";
import { GeminiAccount } from "./gemini/account";
import { PublishView } from "./publish/panel";
import { ModelHealth } from "./llm/health";
import { ModelServer } from "./server/process";

// Fixed rather than ephemeral, so that a server the extension did not start —
// the one under the debugger, or the one belonging to another window — is
// somewhere it can be found.
const PORT = 8765;

// This method is called when your extension is activated, which happens the
// first time the Authorship view becomes visible.
export function activate(context: vscode.ExtensionContext) {
    // Everything the Python side says about itself, kept where a reader can be
    // pointed at it when an install or a start goes wrong.
    const log = vscode.window.createOutputChannel("Authorship");
    context.subscriptions.push(log);

    // Installs the model environment if this is the first run of this version,
    // then starts the server. Both happen underneath: nothing below waits on it,
    // and the status bar carries the news.
    context.subscriptions.push(new ModelServer(context, PORT, log));

    // The author's Gemini account — an API key in this machine's keychain. Only
    // one tool needs it: correcting the style of a manuscript is the one thing
    // here that cannot be done by a model running beside the editor.
    const gemini = new GeminiAccount(context, PORT);
    context.subscriptions.push(gemini);
    for (const [name, run] of Object.entries(gemini.commands)) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`authorship.gemini.${name}`, run),
        );
    }

    // The editor a `.author` file opens in. Declared in package.json under
    // contributes.customEditors as the default for the extension, so opening one
    // lands here rather than in the text editor.
    const authorEditor = new AuthorFileEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            AuthorFileEditorProvider.viewType,
            authorEditor,
            {
                webviewOptions: { retainContextWhenHidden: true },
                // Two views of one document would each repaint the other; the
                // document is the shared truth, so one view per document.
                supportsMultipleEditorsPerDocument: false,
            },
        ),
    );

    // The view container and view are declared in package.json under
    // contributes.viewsContainers / contributes.views. Registering the provider
    // here is what makes the view render; VS Code activates the extension
    // automatically the first time the view becomes visible.
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "authorship.manuscript",
            new PublishView(context, PORT, gemini),
            // Keep the readings while the view is hidden, so switching away and
            // back doesn't blank the plot.
            { webviewOptions: { retainContextWhenHidden: true } },
        ),
    );

    // Reflects the model server's own state in the status bar, whether that
    // server is the one started above or one already running.
    const health = new ModelHealth(PORT);
    context.subscriptions.push(health);
}

// This method is called when your extension is deactivated
export function deactivate() {}
