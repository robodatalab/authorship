// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { StoryGraphPanel } from './story_graph';

// This method is called when your extension is activated, which happens the
// first time the Authorship view becomes visible.
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "authorship" is now active!');

	// The view container and view are declared in package.json under
	// contributes.viewsContainers / contributes.views. Registering the provider
	// here is what makes the view render; VS Code activates the extension
	// automatically the first time the view becomes visible.
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			'authorship.manuscript',
			new ManuscriptProvider()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('authorship.showStoryGraph', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'markdown') {
				vscode.window.showInformationMessage(
					'Open a markdown file to see its story graph.'
				);
				return;
			}
			StoryGraphPanel.reveal(context, editor.document.uri, editor.viewColumn);
		})
	);
}

class ManuscriptProvider implements vscode.TreeDataProvider<string> {
	getTreeItem(element: string): vscode.TreeItem {
		return new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
	}

	getChildren(element?: string): string[] {
		return element ? [] : ['Chapter One', 'Chapter Two'];
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
