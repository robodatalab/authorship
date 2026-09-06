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

    const gemini = new GeminiAccount(context, MODEL_SERVER_PORT);
    context.subscriptions.push(gemini);
    for (const [name, run] of Object.entries(gemini.commands)) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`authorship.gemini.${name}`, run),
        );
    }

    const authorEditor = new AuthorFileEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            AuthorFileEditorProvider.viewType,
            authorEditor,
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false,
            },
        ),
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "authorship.manuscript",
            new PublishView(context, MODEL_SERVER_PORT, gemini),
            { webviewOptions: { retainContextWhenHidden: true } },
        ),
    );

    const health = new ModelHealth(MODEL_SERVER_PORT);
    context.subscriptions.push(health);
}

export function deactivate() {}
