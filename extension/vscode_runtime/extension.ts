import * as vscode from "vscode";
import { AuthorFileEditorProvider } from "./author_file_editor_provider";
import { GeminiAccount } from "./gemini/account";
import { PublishView } from "./publish/panel";
import { ModelHealth } from "./llm/health";
import { MODEL_SERVER_PORT, ModelServer } from "./server/process";

export function activate(context: vscode.ExtensionContext) {
    const log = vscode.window.createOutputChannel("Authorship");
    context.subscriptions.push(log);

    context.subscriptions.push(
        new ModelServer(context, MODEL_SERVER_PORT, log),
    );

    const geminiAccount = new GeminiAccount(context, MODEL_SERVER_PORT);
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
            new PublishView(context, MODEL_SERVER_PORT, geminiAccount),
            { webviewOptions: { retainContextWhenHidden: true } },
        ),
    );

    context.subscriptions.push(new ModelHealth(MODEL_SERVER_PORT));
}

export function deactivate() {}
