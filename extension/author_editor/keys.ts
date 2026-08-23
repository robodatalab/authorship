// Which keystroke is which.
//
// Apart from what any of them do, because what a chord means is a question with
// its own answers — a Mac says something different from a PC, and Alt makes a
// key report a letter nobody pressed. Kept together so that the answers can be
// read against each other, and free of everything else so they can be tested
// without a page.

/** A plain step left or right, which every cursor can take together. */
export function isStepKey(event: KeyboardEvent): boolean {
	return (
		(event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
		!event.shiftKey &&
		!event.altKey &&
		!event.ctrlKey &&
		!event.metaKey
	);
}

/** Ctrl+D, and Cmd+D on a Mac. */
export function isCursorKey(event: KeyboardEvent): boolean {
	return (
		(event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'd'
	);
}

/**
 * Ctrl+S, and Cmd+S on a Mac.
 *
 * Not ours to act on — VS Code holds the save and gets the keystroke whatever we
 * do with it. It is caught only so the cell being typed in can be written to the
 * document before the save reads it.
 */
export function isSaveKey(event: KeyboardEvent): boolean {
	return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's';
}

/** Ctrl+F, and Cmd+F on a Mac. */
export function isFindKey(event: KeyboardEvent): boolean {
	return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f';
}

/** Ctrl+H, and Cmd+Alt+F on a Mac, where Cmd+H is the system's own. */
export function isReplaceKey(event: KeyboardEvent): boolean {
	if (event.altKey) {
		// Alt makes the key itself say something else on a Mac; what is meant is
		// where the key is on the keyboard.
		return (event.ctrlKey || event.metaKey) && event.code === 'KeyF';
	}
	return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h';
}

/** The keys that mean one place rather than several. */
export const MOVES = new Set([
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'Home',
	'End',
	'PageUp',
	'PageDown',
]);
