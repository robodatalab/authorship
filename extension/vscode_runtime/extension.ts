import * as vscode from "vscode";
import { AuthorFileEditorProvider } from "./author_file_editor_provider";
import { GeminiAccount } from "./gemini/account";
import { PublishView } from "./publish/panel";
import { ModelHealth } from "./llm/health";
import { modelServerPort, ModelServer } from "./server/process";

export function activate(context: vscode.ExtensionContext) {
    const log = vscode.window.createOutputChannel("Authorship");
    context.subscriptions.push(log);

    const port = modelServerPort();
    context.subscriptions.push(new ModelServer(context, port, log));

    const geminiAccount = new GeminiAccount(context, port);
    context.subscriptions.push(geminiAccount);
    for (const [commandName, runTheCommand] of Object.entries(
        geminiAccount.commands,
    )) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                `authorship.gemini.${commandName}`,
                runTheCommand,
            ),
        );
    }

    const authorFileEditor = new AuthorFileEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            AuthorFileEditorProvider.viewType,
            authorFileEditor,
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false,
            },
        ),
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "authorship.manuscript",
            new PublishView(context, port, geminiAccount),
            { webviewOptions: { retainContextWhenHidden: true } },
        ),
    );

    context.subscriptions.push(new ModelHealth(port));
}

export function deactivate() {}
