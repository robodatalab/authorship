// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AuthorEditorProvider } from './author_editor/panel';
import { PublishView } from './publish/panel';
import { ModelHealth } from './llm/health';

// This method is called when your extension is activated, which happens the
// first time the Authorship view becomes visible.
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "authorship" is now active!');

	// The editor a `.author` file opens in. Declared in package.json under
	// contributes.customEditors as the default for the extension, so opening one
	// lands here rather than in the text editor.
	const authorEditor = new AuthorEditorProvider(context, 8765);
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			AuthorEditorProvider.viewType,
			authorEditor,
			{
				webviewOptions: { retainContextWhenHidden: true },
				// Two views of one document would each repaint the other; the
				// document is the shared truth, so one view per document.
				supportsMultipleEditorsPerDocument: false,
			}
		)
	);

	// Its tools are VS Code's own buttons, contributed to the editor title bar in
	// package.json and shown only over a `.author` editor. Being commands, they
	// are in the Command Palette and bindable to keys for free — which a toolbar
	// drawn inside the webview could never be.
	for (const [name, run] of Object.entries(authorEditor.commands)) {
		context.subscriptions.push(
			vscode.commands.registerCommand(`authorship.author.${name}`, run)
		);
	}

	// The view container and view are declared in package.json under
	// contributes.viewsContainers / contributes.views. Registering the provider
	// here is what makes the view render; VS Code activates the extension
	// automatically the first time the view becomes visible.
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'authorship.manuscript',
			new PublishView(context, 8765),
			// Keep the readings while the view is hidden, so switching away and
			// back doesn't blank the plot.
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	// Reflects the model server's own state in the status bar. The server is
	// started by the launch configuration, not from here.
	const health = new ModelHealth(8765);
	context.subscriptions.push(health);

}

// This method is called when your extension is deactivated
export function deactivate() {}
