// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { StoryGraphPanel } from './story_graph/panel';
import { ModelHealth } from './llm/health';
import { GraphBuilder } from './llm/build';

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

	// Reflects the model server's own state in the status bar. The server is
	// started by the launch configuration, not from here.
	const health = new ModelHealth(8765);
	context.subscriptions.push(health);

	// Saving a manuscript rebuilds its story graph. The builder shares the status
	// bar, so the same item reads `building` while a rebuild is in flight.
	context.subscriptions.push(new GraphBuilder(8765, health));

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
