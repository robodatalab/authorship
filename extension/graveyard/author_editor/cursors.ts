// Typing into several places in one cell at once.
//
// Ctrl+D takes what the author has selected and finds it again further down the
// cell, keeping the place it came from, so that a name is changed everywhere it
// appears by typing it once. A textarea has one caret and no way of being told
// otherwise, so the other places are kept here and the page draws them itself.
//
// What is selected is the whole of the question — nothing is guessed at from
// where the caret happens to be, and nothing is matched but the text itself.
//
// One cell at a time, always. What the author is typing into is a box, and a
// second box has a caret of its own that nothing here could reach.

/** A place being typed into: a selection, or a caret where the two ends meet. */
export interface Cursor {
	at: number;
	end: number;
}

/**
 * The next place the text says the same thing, that is not already taken.
 *
 * From the last cursor onwards and then round to the top, so that the last
 * occurrence in a cell leads back to the first rather than to nothing. Case is
 * kept: an author taking "Wren" is not taking "wren" as well.
 */
export function nextOccurrence(
	text: string,
	needle: string,
	taken: Cursor[]
): Cursor | null {
	if (!needle) {
		return null;
	}
	const from = taken.reduce((last, one) => Math.max(last, one.end), 0);
	const round = [...occurrences(text, needle, from), ...occurrences(text, needle, 0)];
	return round.find((place) => !taken.some((one) => one.at === place.at)) ?? null;
}

/**
 * The text with the same thing typed at every cursor at once, and where the
 * cursors are left afterwards.
 *
 * `reach` is what a key that deletes takes with it — one character back for
 * backspace, one forward for delete, and none for a key that only types. A
 * cursor with something selected deletes that instead, as it does anywhere else.
 *
 * The cursors come back in the order they went in, so that the one the author's
 * own caret is on is still that one.
 */
export function edited(
	text: string,
	cursors: Cursor[],
	insert: string,
	reach: number
): { text: string; cursors: Cursor[] } {
	const order = cursors
		.map((cursor, index) => ({ cursor, index }))
		.sort((a, b) => a.cursor.at - b.cursor.at);
	const placed: Cursor[] = new Array<Cursor>(cursors.length);
	let out = '';
	let read = 0;

	for (const { cursor, index } of order) {
		const empty = cursor.at === cursor.end;
		const at = empty && reach < 0 ? Math.max(0, cursor.at - 1) : cursor.at;
		const end = empty && reach > 0 ? Math.min(text.length, cursor.end + 1) : cursor.end;
		// Two cursors that have grown into each other are one place, not two.
		if (at < read) {
			placed[index] = { at: out.length, end: out.length };
			continue;
		}
		out += text.slice(read, at) + insert;
		placed[index] = { at: out.length, end: out.length };
		read = end;
	}

	return { text: out + text.slice(read), cursors: placed };
}

function occurrences(text: string, needle: string, from: number): Cursor[] {
	const places: Cursor[] = [];
	for (
		let at = text.indexOf(needle, from);
		at >= 0;
		at = text.indexOf(needle, at + 1)
	) {
		places.push({ at, end: at + needle.length });
	}
	return places;
}
