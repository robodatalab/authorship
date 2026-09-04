export const EXTENSION = '.author';

export const MARKDOWN = 'markdown';
export const CHAPTER = 'chapter';
export const PART = 'part';
export const TITLE_PAGE = 'title-page';
export const COVER = 'cover';
export const CONTENTS = 'contents';
export const DISCLAIMER = 'disclaimer';
export const ABOUT = 'about';
export const BLURB = 'blurb';
export const NOTE = 'note';
export const RECAP = 'recap';

/** What an attribute says when the answer to it is no. */
export const NO = 'no';

/** Whether a part is printed as a page of the book. */
export const PRINT = 'print';

export interface Cell {
	kind: string;
	source: string;
	attrs: Record<string, string>;
}

const MARKER = /^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$/;
const ATTR = /([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

export function parse(text: string): Cell[] {
	const cells: Cell[] = [];
	let kind = MARKDOWN;
	let attrs: Record<string, string> = {};
	let body: string[] = [];

	const close = (): void => {
		const source = trimBlankEnds(body);
		// The run of text above the first marker is only a cell if the author
		// wrote something there; a document that opens with a marker does not
		// start with an empty one.
		if (source || cells.length > 0 || kind !== MARKDOWN || hasAny(attrs)) {
			cells.push({ kind, source, attrs: { ...attrs } });
		}
	};

	for (const line of text.split('\n')) {
		const marker = MARKER.exec(line);
		if (!marker) {
			body.push(line);
			continue;
		}
		close();
		kind = marker[1];
		attrs = readAttrs(marker[2]);
		body = [];
	}
	close();
	return cells;
}

function readAttrs(text: string): Record<string, string> {
	// `matchAll` on a /g regex needs the index reset; the literal is shared.
	ATTR.lastIndex = 0;
	const attrs: Record<string, string> = {};
	for (const found of text.matchAll(ATTR)) {
		attrs[found[1]] = unescape(found[2]);
	}
	return attrs;
}

function unescape(value: string): string {
	return value.replace(/\\(.)/g, '$1');
}

function hasAny(attrs: Record<string, string>): boolean {
	return Object.keys(attrs).length > 0;
}

function trimBlankEnds(body: string[]): string {
	return stored(body.join('\n'));
}

export function dumps(cells: Cell[]): string {
	const out: string[] = [];
	for (const cell of cells) {
		out.push(markerFor(cell));
		out.push('');
		if (cell.source) {
			out.push(cell.source);
			out.push('');
		}
	}
	return out.join('\n');
}

export function cellsOf(cells: Cell[], kind: string): Cell[] {
	return cells.filter((cell) => cell.kind === kind);
}

export function has(cells: Cell[], kind: string): boolean {
	return cells.some((cell) => cell.kind === kind);
}

export function addMissing(cells: Cell[], wanted: Cell[]): Cell[] {
	const added = [...cells];
	for (const cell of wanted) {
		if (!has(added, cell.kind)) {
			added.push(cell);
		}
	}
	return added;
}

export function markdown(source: string): Cell {
	return { kind: MARKDOWN, source, attrs: {} };
}

export function chapter(title: string): Cell {
	return { kind: CHAPTER, source: '', attrs: { title } };
}

export function part(title: string, printed = true): Cell {
	return {
		kind: PART,
		source: '',
		attrs: printed ? { title } : { title, [PRINT]: NO },
	};
}

export function printsPage(cell: Cell): boolean {
	return cell.attrs[PRINT] !== NO;
}

export function cover(src: string, alt = 'Cover'): Cell {
	return { kind: COVER, source: `![${alt}](${src})`, attrs: { src } };
}

export function contents(): Cell {
	return { kind: CONTENTS, source: '', attrs: {} };
}

export function titleOf(cell: Cell): string {
	return cell.attrs.title ?? '';
}

export function authorPathFor(mdPath: string): string {
	return mdPath.replace(/\.md$/i, '') + EXTENSION;
}

export function stored(source: string): string {
	return source.replace(/^\n+/, '').replace(/\n+$/, '');
}

function markerFor(cell: Cell): string {
	const said = Object.entries(cell.attrs)
		.map(([name, value]) => ` ${name}="${escape(value)}"`)
		.join('');
	return `<!-- cell: ${cell.kind}${said} -->`;
}

function escape(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
