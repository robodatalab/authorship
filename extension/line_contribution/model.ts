// Turning a section's line scores into the column drawn beside the prose.
//
// What an edit is, in line terms, lives in document/edits.ts: attribution and
// search both hold line numbers and both have to survive the prose moving under
// them, but what each does about it differs and stays with the feature.

import type { LineEdit } from '../document/edits';
//
// Deliberately free of the `vscode` module, so the drawing decisions can be read
// and tested without launching an editor. Everything here deals in plain numbers
// and strings; gutter.ts turns them into decorations.

/** One line's share of its section, as the server scored it. */
export interface LineShare {
	/** 0-based line in the manuscript. */
	line: number;
	/** Percent of the section's total displacement. Shares sum to 100. */
	share: number;
}

/** The scored section, as `<name>.attribution.yaml` holds it. */
export interface SectionContribution {
	title: string;
	/** 0-based, inclusive. The heading sits at `start - 1`. */
	start: number;
	end: number;
	/** The summed displacement, before it was shared out. */
	displacement: number;
	lines: LineShare[];
}

/**
 * `story.md` sits next to `story.attribution.yaml` — by convention, not
 * configuration. Mirrors `attribution_path_for` in server/line_contribution.py.
 */
export function attributionPathFor(docPath: string): string {
	return docPath.replace(/\.md$/i, '') + '.attribution.yaml';
}

/**
 * Read the on-disk shape into the sections the column draws.
 *
 * The file accumulates: sections are scored one at a time but read all at once.
 * It is machine-written and may be read mid-rewrite, so anything unusable is
 * dropped rather than failing the read — a partial file draws whatever part of
 * itself is whole.
 */
export function normalize(raw: unknown): SectionContribution[] {
	const rows = (raw as { sections?: unknown } | null)?.sections;
	const sections: SectionContribution[] = [];

	for (const entry of Array.isArray(rows) ? rows : []) {
		const section = entry as Record<string, unknown> | null;
		const start = Number(section?.start);
		const end = Number(section?.end);
		if (!section || !Number.isFinite(start) || !Number.isFinite(end)) {
			continue;
		}

		const lines: LineShare[] = [];
		for (const row of Array.isArray(section.lines) ? section.lines : []) {
			const line = Number((row as { line?: unknown })?.line);
			const share = Number((row as { share?: unknown })?.share);
			if (Number.isFinite(line) && Number.isFinite(share)) {
				lines.push({ line, share });
			}
		}

		sections.push({
			title: String(section.title ?? ''),
			start,
			end,
			displacement: Number(section.displacement) || 0,
			lines,
		});
	}

	return sections;
}

/** The on-disk shape, as the server writes it. */
export function denormalize(sections: SectionContribution[]): unknown {
	return {
		sections: sections.map((section) => ({
			title: section.title,
			start: section.start,
			end: section.end,
			displacement: section.displacement,
			lines: section.lines.map((entry) => ({ line: entry.line, share: entry.share })),
		})),
	};
}

const FILLED = '█';
const EMPTY = '░';

/** Cells in the bar. Eight is as fine as block characters usefully go. */
export const CELLS = 8;

/**
 * Below this fraction of the section's own strongest line, a line is flagged.
 *
 * The flag is what the column is for. A low score does not mean the line is
 * badly written — it means removing it leaves the section saying what it already
 * said, so the line is either redundant or the edge of something that belongs in
 * a section of its own.
 */
export const LOW_FRACTION = 0.25;

/**
 * The bar for one line, scaled to the strongest line in its own section.
 *
 * Scaled to the peak rather than to 100, because shares are bounded by section
 * length — in a forty-line section every line would sit under three percent and
 * the whole column would read as empty. The peak is always full, and what the
 * eye then compares is the shape within the section, which is the question.
 */
export function bar(share: number, peak: number): string {
	if (peak <= 0) {
		return EMPTY.repeat(CELLS);
	}
	// A line that scored above zero gets a cell of its own. The low scores are
	// the finding here, and an empty bar is indistinguishable from a line that
	// was never measured.
	const cells =
		share <= 0 ? 0 : Math.min(CELLS, Math.max(1, Math.round((CELLS * share) / peak)));
	return FILLED.repeat(cells) + EMPTY.repeat(CELLS - cells);
}

/** The bar and its percentage, at a fixed width so the column stays straight. */
export function label(share: number, peak: number): string {
	return `${bar(share, peak)} ${Math.round(share).toString().padStart(3, ' ')}%`;
}

export function peakShare(lines: readonly LineShare[]): number {
	return lines.reduce((highest, entry) => Math.max(highest, entry.share), 0);
}

export function isLow(share: number, peak: number): boolean {
	return peak > 0 && share < peak * LOW_FRACTION;
}

/**
 * The scores that still describe the manuscript after an edit.
 *
 * A section that has been written in is no longer the section that was scored,
 * so its scores go rather than being carried forward wrong. Sections below the
 * edit keep theirs and move down or up with the prose; sections above it are
 * untouched.
 *
 * Edits arriving in one change event are all expressed against the document as
 * it was, so they are applied last-first and each one's line numbers still mean
 * what they said.
 */
export function afterEdits(
	sections: SectionContribution[],
	edits: LineEdit[]
): SectionContribution[] {
	let surviving = sections;
	for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
		const kept = surviving.filter((section) => !touches(section, edit));
		const moved = kept.map((section) =>
			section.start - 1 > edit.end ? shift(section, edit.delta) : section
		);
		// The same array back when nothing was dropped and nothing moved, so the
		// caller can tell an edit that reached the scores from one that did not.
		const untouched =
			kept.length === surviving.length &&
			moved.every((section, index) => section === kept[index]);
		surviving = untouched ? surviving : moved;
	}
	return surviving;
}

/** A heading counts as part of its section — retitling it rescores it. */
function touches(section: SectionContribution, edit: LineEdit): boolean {
	return section.start - 1 <= edit.end && section.end >= edit.start;
}

function shift(section: SectionContribution, delta: number): SectionContribution {
	if (delta === 0) {
		return section;
	}
	return {
		...section,
		start: section.start + delta,
		end: section.end + delta,
		lines: section.lines.map((entry) => ({ ...entry, line: entry.line + delta })),
	};
}

/**
 * What to say about the section as a whole.
 *
 * Shares sum to 100 whether or not the section has any structure, so the
 * displacement is the only figure that distinguishes a section resting on two
 * lines from one whose lines are all interchangeable.
 */
export function summary(section: SectionContribution): string {
	const flagged = section.lines.filter((entry) =>
		isLow(entry.share, peakShare(section.lines))
	).length;
	return (
		`${section.title || 'This section'} — ${section.lines.length} lines, ` +
		`${flagged} contributing little, displacement ${section.displacement.toFixed(3)}`
	);
}
