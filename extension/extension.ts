// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { StoryGraphPanel } from './story_graph/panel';
import { PublishView } from './publish/panel';
import { Highlights } from './highlight/orchestrator';
import { ModelHealth } from './llm/health';
import { GraphBuilder } from './llm/build';
import { GrammarFix } from './llm/grammar';
import { BuildActivity } from './llm/activity';
import { LineContributionGutter } from './line_contribution/gutter';
import { ManuscriptSearch } from './search/results';

// This method is called when your extension is activated, which happens the
// first time the Authorship view becomes visible.
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "authorship" is now active!');

	// The one thing that lights up lines of a manuscript. Both the graph and the
	// search send the reader to passages, and without a single owner they paint
	// over each other's marks and clear marks they did not make.
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

	// Building a manuscript's story graph, on request. Who is building what is
	// held apart from the builder, because the status bar and the graph panel
	// both report it and neither should have to ask the other.
	const activity = new BuildActivity();
	const builder = new GraphBuilder(8765, health, activity);
	context.subscriptions.push(builder);

	context.subscriptions.push(
		vscode.commands.registerCommand('authorship.buildRepresentations', () => {
			const editor = activeManuscript();
			if (!editor) {
				vscode.window.showInformationMessage(
					'Open a manuscript to build its representations.'
				);
				return;
			}
			void builder.build(editor.document.uri);
		})
	);

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

	// The results live in the Search drawer, so the command's job is to put the
	// author in front of it rather than to ask anything itself.
	context.subscriptions.push(
		vscode.commands.registerCommand('authorship.searchManuscript', () =>
			void vscode.commands.executeCommand('authorship.manuscript.focus')
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
			StoryGraphPanel.reveal(
				context,
				activity,
				highlights,
				editor.document.uri,
				editor.viewColumn
			);
		})
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
