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
			data-tip="Divide into Parts — cut the story into part_1.author, part_2.author… beside it"><i class="aicon aicon-export-parts"></i></button>
		<span class="divider"></span>
		<button class="tool" id="as-text" type="button"
			data-tip="View Source — open the same file as plain text"><i class="codicon codicon-file-code"></i></button>
		<span class="spacer"></span>
		<span class="doc-where" id="doc-where"></span>
		<span class="spacer"></span>
		<span class="doc-status" id="doc-status"></span>
		<div class="find" id="find" hidden>
			<button class="find-toggle" id="find-toggle" type="button"
				aria-label="Toggle Replace" data-tip="Toggle Replace"><i class="codicon codicon-chevron-right"></i></button>
			<div class="find-rows">
				<div class="find-row">
					<div class="find-box" id="find-box">
						<input class="find-input" id="find-what" type="text" placeholder="Find" aria-label="Find">
						<button class="find-option" id="find-case" type="button"
							aria-label="Match Case" data-tip="Match Case"><i class="codicon codicon-case-sensitive"></i></button>
						<button class="find-option" id="find-word" type="button"
							aria-label="Match Whole Word" data-tip="Match Whole Word"><i class="codicon codicon-whole-word"></i></button>
						<button class="find-option" id="find-regex" type="button"
							aria-label="Use Regular Expression" data-tip="Use Regular Expression"><i class="codicon codicon-regex"></i></button>
					</div>
					<span class="find-count" id="find-count"></span>
					<button class="find-action" id="find-previous" type="button"
						aria-label="Previous Match" data-tip="Previous Match"><i class="codicon codicon-arrow-up"></i></button>
					<button class="find-action" id="find-next" type="button"
						aria-label="Next Match" data-tip="Next Match"><i class="codicon codicon-arrow-down"></i></button>
					<button class="find-action" id="find-close" type="button"
						aria-label="Close" data-tip="Close"><i class="codicon codicon-close"></i></button>
				</div>
				<div class="find-row" id="find-replace-row" hidden>
					<div class="find-box">
						<input class="find-input" id="find-with" type="text" placeholder="Replace" aria-label="Replace">
					</div>
					<button class="find-action" id="find-replace" type="button"
						aria-label="Replace" data-tip="Replace"><i class="codicon codicon-replace"></i></button>
					<button class="find-action" id="find-replace-all" type="button"
						aria-label="Replace All" data-tip="Replace All"><i class="codicon codicon-replace-all"></i></button>
				</div>
			</div>
		</div>
	</header>
	<main id="cells" class="cells"></main>
	<div id="menu" class="menu" hidden></div>`;
