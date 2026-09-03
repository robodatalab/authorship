import { Fragment } from 'react';
import './AuthorFileEditorMainMenu.css';

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

interface AuthorFileEditorMainMenuTool {
	hostMessageType: string;
	iconClassName: string;
	tooltip: string;
}

const AUTHOR_FILE_EDITOR_MAIN_MENU_TOOL_GROUPS: AuthorFileEditorMainMenuTool[][] = [
	[
		{
			hostMessageType: 'compile',
			iconClassName: 'codicon codicon-run-all',
			tooltip: 'Run All — build every section that is built rather than written',
		},
		{
			hostMessageType: 'checkToggle',
			iconClassName: 'codicon codicon-checklist',
			tooltip: 'Check Prose — underline grammar and repetition while you write',
		},
		{
			hostMessageType: 'fixStyle',
			iconClassName: 'codicon codicon-sparkle',
			tooltip:
				'Fix Style & Grammar — read the whole manuscript with Gemini and correct it, a chapter at a time',
		},
	],
	[
		{
			hostMessageType: 'importMarkdown',
			iconClassName: 'aicon aicon-import-markdown',
			tooltip:
				'Import Markdown — replace this document with an existing markdown manuscript',
		},
		{
			hostMessageType: 'exportMarkdown',
			iconClassName: 'aicon aicon-export-markdown',
			tooltip:
				'Export Markdown — write this document out as one plain markdown manuscript',
		},
		{
			hostMessageType: 'exportEpub',
			iconClassName: 'aicon aicon-export-epub',
			tooltip: 'Export EPUB — build the book beside this document',
		},
		{
			hostMessageType: 'partition',
			iconClassName: 'aicon aicon-export-parts',
			tooltip:
				'Divide into Parts — cut the story into part_1.author, part_2.author… beside it',
		},
	],
	[
		{
			hostMessageType: 'openAsText',
			iconClassName: 'codicon codicon-file-code',
			tooltip: 'View Source — open the same file as plain text',
		},
	],
];

export function AuthorFileEditorMainMenu() {
	return (
		<nav className="author-file-editor-main-menu">
			{AUTHOR_FILE_EDITOR_MAIN_MENU_TOOL_GROUPS.map((toolGroup, toolGroupIndex) => (
				<Fragment key={toolGroupIndex}>
					{toolGroupIndex > 0 && (
						<span className="author-file-editor-main-menu-divider" />
					)}
					{toolGroup.map((tool) => (
						<button
							key={tool.hostMessageType}
							type="button"
							className="author-file-editor-main-menu-tool"
							title={tool.tooltip}
							aria-label={tool.tooltip}
							onClick={() =>
								vscodeApi.postMessage({ type: tool.hostMessageType })
							}
						>
							<i className={tool.iconClassName} />
						</button>
					))}
				</Fragment>
			))}
		</nav>
	);
}
