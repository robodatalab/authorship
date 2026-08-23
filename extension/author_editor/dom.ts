// The small pieces of DOM every part of the surface builds out of.
//
// Nothing here knows what a cell is or what the document says. A button, a box
// grown to its text, a path made absolute: given the same arguments each of them
// makes the same element wherever it is called from, which is what lets them be
// read once and then trusted everywhere.

/**
 * Grow the box to its text.
 *
 * Counting newlines is not enough — a paragraph wraps into as many lines as the
 * width allows, and a box sized to the logical lines gets a scrollbar of its own.
 * One document, one scrollbar.
 */
export function autosize(input: HTMLTextAreaElement): void {
	input.style.height = 'auto';
	input.style.height = `${input.scrollHeight}px`;
}

/** A button carrying one of VS Code's own icons, named as the codicon is named. */
export function iconButton(
	icon: string,
	title: string,
	onClick: (event: MouseEvent) => void
): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'icon';
	button.setAttribute('aria-label', title);
	button.dataset.tip = title;
	const glyph = document.createElement('i');
	glyph.className = `codicon codicon-${icon}`;
	button.append(glyph);
	button.addEventListener('click', (event) => {
		event.stopPropagation();
		onClick(event);
	});
	return button;
}

/** A button from the strip between cells: an icon, and usually a word beside it. */
export function insertButton(
	label: string,
	onClick: (event: MouseEvent) => void,
	icon = 'add',
	title?: string
): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = label ? 'insert' : 'insert icon-only';
	button.dataset.tip = title ?? `Add a ${label.toLowerCase()} section here`;
	const glyph = document.createElement('i');
	glyph.className = `codicon codicon-${icon}`;
	button.append(glyph);
	if (label) {
		button.append(document.createTextNode(label));
	}
	button.addEventListener('click', (event) => {
		event.stopPropagation();
		onClick(event);
	});
	return button;
}

/**
 * Relative image paths are written for the file's folder, which the webview is
 * not; the host says what that folder is and it is put in from here.
 */
export function withBase(html: string, base: string): string {
	if (!base) {
		return html;
	}
	return html.replace(
		/<img src="(?!https?:|data:)([^"]*)"/g,
		(_m, src) => `<img src="${base}/${src}"`
	);
}
