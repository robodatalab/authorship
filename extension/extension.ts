// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { StoryGraphPanel } from './story_graph/panel';
import { PublishView } from './publish/panel';
import { ModelHealth } from './llm/health';
import { GraphBuilder } from './llm/build';
import { BuildActivity } from './llm/activity';
import { LineContributionGutter } from './line_contribution/gutter';

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
		vscode.window.registerWebviewViewProvider(
			'authorship.manuscript',
			new PublishView(context, 8765),
			// Keep the form's state while the view is hidden, so switching away and
			// back doesn't reset an edit in progress.
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	// Reflects the model server's own state in the status bar. The server is
	// started by the launch configuration, not from here.
	const health = new ModelHealth(8765);
	context.subscriptions.push(health);

	// Building a manuscript's story graph, on request. Who is building what is
	// held apart from the builder, because the status bar and the graph panel
	// both report it and neither should have to ask the other.
	const activity = new BuildActivity();
	const builder = new GraphBuilder(8765, health, activity);
	context.subscriptions.push(builder);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'authorship.buildRepresentations',
			(manuscript: vscode.Uri) => void builder.build(manuscript)
		)
	);

	// How much each line carries the section it is in, drawn beside the prose from
	// the scores held next to the manuscript. Showing them costs nothing and needs
	// no model; only the command computes, and only for one section at a time.
	const contribution = new LineContributionGutter(8765, health);
	context.subscriptions.push(contribution);

	context.subscriptions.push(
		vscode.commands.registerCommand('authorship.scoreSection', () =>
			void contribution.score()
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
			StoryGraphPanel.reveal(context, activity, editor.document.uri, editor.viewColumn);
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
