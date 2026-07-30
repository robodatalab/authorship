import { describe, expect, it } from 'vitest';

import {
	CELLS,
	bar,
	covers,
	isLow,
	label,
	peakShare,
	type SectionContribution,
} from '../../../extension/line_contribution/model';

const SECTION: SectionContribution = {
	title: 'One',
	start: 3,
	end: 9,
	displacement: 0.21,
	lines: [
		{ line: 3, share: 40 },
		{ line: 5, share: 10 },
		{ line: 7, share: 50 },
	],
};

describe('bar', () => {
	it('fills the track for the strongest line in the section', () => {
		expect(bar(50, 50)).toBe('█'.repeat(CELLS));
	});

	it('gives a line that scored above zero a cell of its own', () => {
		// The low scores are the finding, and an empty bar reads as a line that
		// was never measured.
		expect(bar(0.2, 100)).toBe('█' + '░'.repeat(CELLS - 1));
	});

	it('leaves a line that scored nothing empty', () => {
		expect(bar(0, 50)).toBe('░'.repeat(CELLS));
	});

	it('draws every bar the same width', () => {
		for (const share of [0, 0.5, 7, 33, 50]) {
			expect(bar(share, 50)).toHaveLength(CELLS);
		}
	});

	it('scales to the section rather than to a hundred', () => {
		// In a long section every share is small; scaled to 100 the whole column
		// would read as empty.
		expect(bar(3, 3)).toBe('█'.repeat(CELLS));
	});

	it('reads as empty when the section has nothing to share out', () => {
		expect(bar(0, 0)).toBe('░'.repeat(CELLS));
	});
});

describe('label', () => {
	it('is the same width whatever the number', () => {
		const widths = new Set([label(0, 50), label(7, 50), label(100, 100)].map((l) => l.length));
		expect(widths.size).toBe(1);
	});

	it('carries the percentage beside the bar', () => {
		expect(label(50, 50)).toMatch(/50%$/);
	});
});

describe('peakShare', () => {
	it('is the strongest line in the section', () => {
		expect(peakShare(SECTION.lines)).toBe(50);
	});

	it('is zero for a section with no scored lines', () => {
		expect(peakShare([])).toBe(0);
	});
});

describe('isLow', () => {
	it('flags a line well under the section it sits in', () => {
		expect(isLow(10, 50)).toBe(true);
	});

	it('leaves a line near the section peak alone', () => {
		expect(isLow(40, 50)).toBe(false);
	});

	it('flags nothing when there is no peak to be under', () => {
		expect(isLow(0, 0)).toBe(false);
	});
});

describe('covers', () => {
	it('holds for a line inside the section', () => {
		expect(covers(SECTION, 5)).toBe(true);
	});

	it('holds for the heading the section hangs from', () => {
		// A cursor parked on `## One` is in One, not in whatever came before it.
		expect(covers(SECTION, 2)).toBe(true);
	});

	it('holds at both ends', () => {
		expect(covers(SECTION, 3)).toBe(true);
		expect(covers(SECTION, 9)).toBe(true);
	});

	it('fails past either end, so the next section is asked for', () => {
		expect(covers(SECTION, 1)).toBe(false);
		expect(covers(SECTION, 10)).toBe(false);
	});
});
