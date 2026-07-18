import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand("writer.showGraph", () => {
            vscode.window.showInformationMessage(
                "Story graph: not implemented yet.",
            );
        }),

        vscode.commands.registerCommand("writer.reindex", () => {
            vscode.window.showInformationMessage(
                "Reindex: not implemented yet.",
            );
        }),
    );

    const provider: vscode.TreeDataProvider<string> = {
        getTreeItem: (e) => new vscode.TreeItem(e),
        getChildren: () => ["(no facts yet)"],
    };

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("writer.facts", provider),
    );
}

export function deactivate() {}
