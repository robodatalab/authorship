import * as vscode from "vscode";
import { AuthorFileEditorProvider } from "./author_file_editor_provider";
import { openGeminiAccount } from "./gemini/account";
import { PublishView } from "./publish/panel";
import { ServerStatusBarItem } from "./llm/status_bar";
import { ModelServer } from "./server/process";
import { serverPort } from "./server/fetch";

export function activate(context: vscode.ExtensionContext) {
    const log = vscode.window.createOutputChannel("Authorship", { log: true });
    context.subscriptions.push(log);

    context.subscriptions.push(new ModelServer(context, serverPort(), log));

    const geminiAccount = openGeminiAccount(context);
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

    const authorFileEditor = new AuthorFileEditorProvider(context, log);
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
            new PublishView(context, geminiAccount),
            { webviewOptions: { retainContextWhenHidden: true } },
        ),
    );

    context.subscriptions.push(new ServerStatusBarItem());
}

export function deactivate() {}
