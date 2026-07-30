// Turning a section's line scores into the column drawn beside the prose.
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

/** The server's answer for the section the cursor was in. */
export interface SectionContribution {
	title: string;
	/** 0-based, inclusive. The heading sits at `start - 1`. */
	start: number;
	end: number;
	/** The summed displacement, before it was shared out. */
	displacement: number;
	lines: LineShare[];
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

/** Does this section's answer still describe the line the cursor is on? */
export function covers(section: SectionContribution, line: number): boolean {
	return line >= section.start - 1 && line <= section.end;
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
