// What the .author editor's page is made of.
//
// Kept apart from panel.ts because panel.ts imports `vscode` and so cannot be
// loaded outside an editor. The webview's own tests mount this exact markup, so
// an element view.ts reaches for that the page stops carrying is a failing test
// rather than a button that silently does nothing.

export const BODY = `	<header class="toolbar" id="toolbar">
		<button class="tool" id="run-all" type="button"
			data-tip="Run All — build every section that is built rather than written"><i class="codicon codicon-run-all"></i></button>
		<button class="tool" id="spell" type="button"
			data-tip="Spell Check — correct the prose of the selected section"><i class="codicon codicon-check-all"></i></button>
		<span class="divider"></span>
		<button class="tool" id="import-markdown" type="button"
			data-tip="Import Markdown — replace this document with an existing markdown manuscript"><i class="aicon aicon-import-markdown"></i></button>
		<button class="tool" id="export-markdown" type="button"
			data-tip="Export Markdown — write this document out as one plain markdown manuscript"><i class="aicon aicon-export-markdown"></i></button>
		<button class="tool" id="export-epub" type="button"
			data-tip="Export EPUB — build the book beside this document"><i class="aicon aicon-export-epub"></i></button>
		<button class="tool" id="export-parts" type="button"
			data-tip="Export as Parts — cut this document into markdown parts of about a given length"><i class="aicon aicon-export-parts"></i></button>
		<span class="divider"></span>
		<button class="tool" id="as-text" type="button"
			data-tip="View Source — open the same file as plain text"><i class="codicon codicon-file-code"></i></button>
		<span class="spacer"></span>
		<span class="doc-status" id="doc-status"></span>
	</header>
	<main id="cells" class="cells"></main>
	<div id="menu" class="menu" hidden></div>`;
