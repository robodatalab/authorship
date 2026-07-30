// What an edit did to a document's line numbers.
//
// Anything that holds line numbers of its own — attribution scores, search
// results — goes wrong the moment the prose beneath them moves. They all need
// the same two facts about an edit: which lines it landed on, and how many lines
// the document gained or lost by it. What each of them then does with those
// facts is their own business, and differs.
//
// Free of the `vscode` module below the extraction, so the arithmetic can be
// read and tested without launching an editor.

/** A stretch of lines an edit replaced, in the document as it was before it. */
export interface LineEdit {
	/** First line the edit touched. */
	start: number;
	/** Last line it touched, before the edit. */
	end: number;
	/** Lines the document gained, or lost where negative. */
	delta: number;
}

/** The shape of a `vscode.TextDocumentContentChangeEvent`, as far as this needs. */
interface ContentChange {
	range: { start: { line: number }; end: { line: number } };
	text: string;
}

/**
 * Read a change event into line edits.
 *
 * The changes in one event are all expressed against the document as it was, so
 * these are too — whoever applies them has to work last-first for each one's
 * numbers to still mean what they said.
 */
export function editsIn(changes: readonly ContentChange[]): LineEdit[] {
	return changes.map((change) => ({
		start: change.range.start.line,
		end: change.range.end.line,
		delta:
			(change.text.match(/\n/g)?.length ?? 0) -
			(change.range.end.line - change.range.start.line),
	}));
}
