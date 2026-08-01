// The pure logic behind dividing a manuscript: where its sections begin, how much
// each one weighs, which of them travel together, and what a part reads like once
// they do.
//
// Deliberately free of the `vscode` module, so a division can be read and tested
// without launching an editor. Everything here deals in plain strings and counts;
// divide.ts turns the parts into files.
//
// A section is a `##` heading and the lines under it — the same section the
// server reads (server/representations/utils.py), down to taking headings off the
// prose with comments removed, so a stretch commented out for now does not go on
// dividing the manuscript.
//
// Notes to self are not the story, and a part is the story handed on: the
// comments come out on the way in, so nothing downstream has to remember they
// were ever there.

const SECTION_SEPARATOR = '##';
const TITLE_PREFIX = '# ';

const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';

/** A `##` heading and the lines beneath it, the author's notes taken out. */
export interface Section {
	/** The heading line, or null for whatever opens the manuscript before one. */
	heading: string | null;
	lines: string[];
	/** What a reader counts here, the heading included. */
	words: number;
}

/** A manuscript as a division sees it: what to call the parts, and what to cut. */
export interface Manuscript {
	/** The `# ` heading, or empty when the manuscript carries none. */
	title: string;
	sections: Section[];
}

/** Whole sections, gathered into one part. */
export interface Part {
	sections: Section[];
	words: number;
}

/** The length a part is asked to be, absent an answer from the author. */
export const DEFAULT_PART_WORDS = 5000;

/**
 * Read a manuscript into the sections a division cuts along.
 *
 * The notes are gone before anything else is asked of the manuscript, so a
 * heading that was commented out opens nothing and a section weighs only what a
 * reader would count in it.
 *
 * The title is taken out of the section holding it: it names the whole
 * manuscript, and every part opens by naming itself. An opening stretch left with
 * nothing in it is not a section — a manuscript may begin at its first heading.
 */
export function readManuscript(markdown: string): Manuscript {
	const lines = withoutComments(markdown.split(/\r?\n/));

	const titleAt = lines.findIndex((line) => line.startsWith(TITLE_PREFIX));
	const title = titleAt < 0 ? '' : lines[titleAt].slice(TITLE_PREFIX.length).trim();

	const sections: Section[] = [];
	let current: Section = { heading: null, lines: [], words: 0 };

	lines.forEach((line, index) => {
		if (line.startsWith(SECTION_SEPARATOR)) {
			sections.push(current);
			current = { heading: line, lines: [], words: countWords(line) };
		} else if (index !== titleAt) {
			current.lines.push(line);
			current.words += countWords(line);
		}
	});
	sections.push(current);

	return {
		title,
		sections: sections.filter((section) => section.heading !== null || section.words > 0),
	};
}

/**
 * Fill each part with as many whole sections as it will hold.
 *
 * A section joins the part being filled while doing so lands nearer the quota
 * than stopping short would — so a part runs over only by less than it would
 * otherwise run under, and a section that would blow past the quota starts the
 * next part instead. A part always takes at least one section: a section longer
 * than the quota is still a section, and there is nowhere smaller to put it.
 */
export function intoParts(sections: readonly Section[], quota: number): Part[] {
	const parts: Part[] = [];
	let held: Section[] = [];
	let words = 0;

	for (const section of sections) {
		if (held.length > 0 && !nearer(words, section.words, quota)) {
			parts.push({ sections: held, words });
			held = [];
			words = 0;
		}
		held.push(section);
		words += section.words;
	}
	if (held.length > 0) {
		parts.push({ sections: held, words });
	}
	return parts;
}

/** Under the quota it always is; over it, only while the overshoot is the
 *  smaller of the two misses. */
function nearer(words: number, adding: number, quota: number): boolean {
	const over = words + adding - quota;
	return over <= 0 || over < quota - words;
}

/** A part as its file reads: its own title, then the sections it holds. */
export function renderPart(title: string, number: number, part: Part): string {
	const body = part.sections.flatMap((section) =>
		section.heading === null ? section.lines : [section.heading, ...section.lines]
	);
	return [`${TITLE_PREFIX}${partTitle(title, number)}`, '', ...trimBlank(body), ''].join('\n');
}

/** What a part is called — the manuscript's title, and which part this is. */
export function partTitle(title: string, number: number): string {
	return title ? `${title} — Part ${number}` : `Part ${number}`;
}

/** `story.md` divides into `parts/` beside it. */
export const PARTS_FOLDER = 'parts';

export function partFileName(number: number): string {
	return `part_${number}.md`;
}

/**
 * Is this a file a division wrote?
 *
 * Asked before writing, so a manuscript that now makes four parts does not sit in
 * a folder still holding a fifth from when it made five. Nothing else in the
 * folder is a division's to remove.
 */
export function isPartFile(name: string): boolean {
	return /^part_\d+\.md$/i.test(name);
}

/**
 * Whatever the form reported, as a quota.
 *
 * A quota of nothing divides a manuscript into nothing, so anything unusable —
 * blank, negative, not a number — falls back to the default rather than being
 * acted on.
 */
export function quotaOf(raw: unknown): number {
	const words = Math.floor(Number(raw));
	return Number.isFinite(words) && words > 0 ? words : DEFAULT_PART_WORDS;
}

/**
 * Words as a reader counts them: whitespace-separated runs carrying a letter or
 * a digit, so a scene break or a lone dash weighs nothing.
 */
export function countWords(text: string): number {
	return (text.match(/\S+/g) ?? []).filter((run) => /[\p{L}\p{N}]/u.test(run)).length;
}

/**
 * The manuscript with the author's notes taken out.
 *
 * A line with prose beside a note keeps the prose. A line that was nothing but a
 * note goes altogether rather than being left behind as a blank one — and if
 * blank lines were setting the note apart, the ones after it go too. The gap the
 * author left was around the note, not in the prose, so taking the note out
 * leaves the spacing they had rather than a wider one where it used to be.
 */
function withoutComments(lines: readonly string[]): string[] {
	const visible = visibleLines(lines);
	const isNote = (at: number) => visible[at].commented && visible[at].text.trim() === '';
	const isBlank = (at: number) => !visible[at].commented && visible[at].text.trim() === '';

	const kept: string[] = [];
	let index = 0;

	while (index < visible.length) {
		if (!isNote(index)) {
			const { text, commented } = visible[index];
			// Trailing space a note left behind is two keystrokes from a hard line
			// break in markdown; a line nobody wrote in is left exactly as it is.
			kept.push(commented ? text.trimEnd() : text);
			index += 1;
			continue;
		}
		const spaced = kept.length > 0 && kept[kept.length - 1].trim() === '';
		while (index < visible.length && isNote(index)) {
			index += 1;
		}
		while (spaced && index < visible.length && isBlank(index)) {
			index += 1;
		}
	}

	return kept;
}

/** A line with its comments taken out, and whether any of it was one. */
interface Visible {
	text: string;
	commented: boolean;
}

/**
 * Mirrors `visible_lines` in server/representations/utils.py: a comment may span
 * several lines, and one never closed runs to the end of the file — which is how
 * the tail of a draft gets silenced.
 *
 * A line wholly inside a comment counts as commented even though it carries no
 * marker of its own, so the blank lines within a note are known to belong to it.
 */
function visibleLines(lines: readonly string[]): Visible[] {
	let inside = false;
	return lines.map((line) => {
		const kept: string[] = [];
		let commented = inside;
		let rest = line;
		while (rest) {
			if (inside) {
				const close = rest.indexOf(COMMENT_CLOSE);
				if (close < 0) {
					break;
				}
				inside = false;
				rest = rest.slice(close + COMMENT_CLOSE.length);
			} else {
				const opened = rest.indexOf(COMMENT_OPEN);
				if (opened < 0) {
					kept.push(rest);
					break;
				}
				kept.push(rest.slice(0, opened));
				inside = true;
				commented = true;
				rest = rest.slice(opened + COMMENT_OPEN.length);
			}
		}
		return { text: kept.join(''), commented };
	});
}

/** The blank lines a cut leaves at either end of a part. */
function trimBlank(lines: readonly string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start].trim() === '') {
		start += 1;
	}
	while (end > start && lines[end - 1].trim() === '') {
		end -= 1;
	}
	return lines.slice(start, end);
}
