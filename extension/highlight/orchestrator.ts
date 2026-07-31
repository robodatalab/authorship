// The one place that lights up lines of a manuscript.
//
// Features hand it spans and a layer; it owns the decoration types, decides what
// each layer looks like, and repaints whenever the visible editors change. No
// feature makes a decoration type of its own for this, so no feature can paint
// over another or clear marks it did not make.
//
// The attribution column is deliberately not here. It draws in the margin rather
// than on the prose, it is per-line rather than per-span, and it competes with
// nothing — it stays where it is, in line_contribution/gutter.ts.

import * as vscode from 'vscode';

import { Claims, covers, type Layer, type Span } from './model';

export type { Layer, Span } from './model';

export class Highlights implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly claims = new Claims();

	/**
	 * A set a tool turned up — every passage a search answered with.
	 *
	 * Marked in the overview ruler as well as the prose, because the distribution
	 * is half the answer: whether the phrase is answered all through one scene or
	 * scattered over the book is a thing only the scrollbar can say.
	 */
	private readonly findings = vscode.window.createTextEditorDecorationType({
		backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
		overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
		overviewRulerLane: vscode.OverviewRulerLane.Center,
		isWholeLine: true,
	});

	/** The one span the reader was just sent to. Stronger, and short-lived. */
	private readonly focus = vscode.window.createTextEditorDecorationType({
		backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
		isWholeLine: true,
	});

	constructor() {
		this.disposables.push(
			// A manuscript can be opened into a split, or brought back after being
			// closed, without any claim having changed.
			vscode.window.onDidChangeVisibleTextEditors(() => this.paint()),
			vscode.window.onDidChangeTextEditorSelection((event) => this.onSelection(event))
		);
	}

	/**
	 * Light up these spans, displacing whatever else held the layer.
	 *
	 * An empty set is a release rather than a claim on nothing, so a feature that
	 * found nothing this time does not go on holding the layer against one that
	 * found something.
	 */
	claim(
		source: string,
		layer: Layer,
		document: vscode.Uri,
		spans: readonly Span[]
	): void {
		this.claims.claim(source, layer, document.toString(), spans);
		this.paint();
	}

	/** Take back what this source holds — one layer of it, or all of them. */
	release(source: string, layer?: Layer): void {
		this.claims.release(source, layer);
		this.paint();
	}

	/**
	 * Send the reader to a span and light it up.
	 *
	 * The cursor moves, which is what makes the jump undoable by the ordinary
	 * back-navigation, and the focus goes on the span rather than the single line
	 * so a passage of several paragraphs reads as one thing.
	 */
	async reveal(source: string, document: vscode.Uri, span: Span): Promise<void> {
		const editor = await vscode.window.showTextDocument(document, {
			preserveFocus: false,
			preview: false,
		});
		const last = Math.max(0, editor.document.lineCount - 1);
		const start = Math.min(span.start, last);
		const end = Math.min(span.end, last);

		editor.selection = new vscode.Selection(start, 0, start, 0);
		editor.revealRange(
			new vscode.Range(start, 0, end, 0),
			vscode.TextEditorRevealType.InCenterIfOutsideViewport
		);
		// After the cursor move, so the selection change that clears a stale focus
		// does not clear the one being made here.
		this.claim(source, 'focus', document, [{ start, end }]);
	}

	/**
	 * Moving away from the focused span puts it out.
	 *
	 * A focus says "here is where you were sent"; once the reader has gone
	 * somewhere else in the prose that is no longer true, and leaving it lit would
	 * have it competing with wherever they are now. Findings survive — they are
	 * the result of a question, not a record of where the cursor has been.
	 */
	private onSelection(event: vscode.TextEditorSelectionChangeEvent): void {
		const claim = this.claims.on('focus');
		if (!claim || claim.document !== event.textEditor.document.uri.toString()) {
			return;
		}
		if (event.selections.some((selection) => covers(claim.spans, selection.active.line))) {
			return;
		}
		this.claims.clear('focus');
		this.paint();
	}

	private paint(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			const document = editor.document.uri.toString();
			const last = editor.document.lineCount - 1;
			editor.setDecorations(
				this.findings,
				ranges(this.claims.spansIn('findings', document), last)
			);
			editor.setDecorations(
				this.focus,
				ranges(this.claims.spansIn('focus', document), last)
			);
		}
	}

	dispose(): void {
		// The decoration types clear themselves from the editors as they go.
		this.findings.dispose();
		this.focus.dispose();
		for (const item of this.disposables) {
			item.dispose();
		}
	}
}

/** Spans the document is still long enough to hold, as ranges. */
function ranges(spans: readonly Span[], last: number): vscode.Range[] {
	return spans
		.filter((span) => span.start <= last)
		.map((span) => new vscode.Range(span.start, 0, Math.min(span.end, last), 0));
}
