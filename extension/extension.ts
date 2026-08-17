// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PublishView } from './publish/panel';
import { Highlights } from './highlight/orchestrator';
import { ModelHealth } from './llm/health';
import { GrammarFix } from './llm/grammar';
import { ManuscriptSearch } from './search/results';

// This method is called when your extension is activated, which happens the
// first time the Authorship view becomes visible.
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "authorship" is now active!');

	// The one thing that lights up lines of a manuscript — the search sends the
	// reader to passages, and the marks it leaves belong to one owner.
	const highlights = new Highlights();
	context.subscriptions.push(highlights);

	// The search a manuscript is under. It outlives the Authorship view, which
	// only draws it — hiding the panel does not put the answer away.
	const search = new ManuscriptSearch(8765, highlights);
	context.subscriptions.push(search);

	// The view container and view are declared in package.json under
	// contributes.viewsContainers / contributes.views. Registering the provider
	// here is what makes the view render; VS Code activates the extension
	// automatically the first time the view becomes visible.
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'authorship.manuscript',
			new PublishView(context, 8765, search),
			// Keep the form's state while the view is hidden, so switching away and
			// back doesn't reset an edit in progress.
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	// Reflects the model server's own state in the status bar. The server is
	// started by the launch configuration, not from here.
	const health = new ModelHealth(8765);
	context.subscriptions.push(health);

	// Correcting the passage in hand. The server rewrites the file, so the
	// correction arrives as a change to the prose rather than a report about it.
	const grammar = new GrammarFix(8765, health);
	context.subscriptions.push(grammar);

	context.subscriptions.push(
		vscode.commands.registerCommand('authorship.fixGrammar', () => {
			const editor = activeManuscript();
			if (!editor) {
				vscode.window.showInformationMessage(
					'Open a manuscript, and select the lines to correct or put the cursor in the section to correct.'
				);
				return;
			}
			void grammar.fix(editor);
		})
	);

	// The results live in the Search drawer, so the command's job is to put the
	// author in front of it rather than to ask anything itself.
	context.subscriptions.push(
		vscode.commands.registerCommand('authorship.searchManuscript', () =>
			void vscode.commands.executeCommand('authorship.manuscript.focus')
		)
	);
}

/**
 * The manuscript a title-bar button acts on — the editor rather than the file,
 * because what an author has selected, and where their cursor is, is half of
 * what they are asking for.
 */
function activeManuscript(): vscode.TextEditor | undefined {
	const editor = vscode.window.activeTextEditor;
	if (
		editor?.document.languageId === 'markdown' &&
		editor.document.uri.scheme === 'file'
	) {
		return editor;
	}
	return undefined;
}

// This method is called when your extension is deactivated
export function deactivate() {}
