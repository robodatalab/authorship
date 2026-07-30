import { describe, expect, it } from 'vitest';

import {
	CELLS,
	afterEdits,
	attributionPathFor,
	bar,
	denormalize,
	isLow,
	label,
	normalize,
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

const ONE: SectionContribution = {
	title: 'One',
	start: 3,
	end: 6,
	displacement: 0.2,
	lines: [
		{ line: 3, share: 60 },
		{ line: 5, share: 40 },
	],
};

const TWO: SectionContribution = {
	title: 'Two',
	start: 9,
	end: 12,
	displacement: 0.3,
	lines: [
		{ line: 9, share: 70 },
		{ line: 11, share: 30 },
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

describe('attributionPathFor', () => {
	it('sits beside the manuscript', () => {
		expect(attributionPathFor('/stories/story_2.md')).toBe(
			'/stories/story_2.attribution.yaml'
		);
	});

	it('matches the extension whatever its case', () => {
		expect(attributionPathFor('/stories/Story.MD')).toBe(
			'/stories/Story.attribution.yaml'
		);
	});

	it('agrees with attribution_path_for in server/line_contribution.py', () => {
		expect(attributionPathFor('/stories/story_2.md')).not.toBe(
			'/stories/story_2.graph.yaml'
		);
	});
});

describe('normalize', () => {
	it('reads the shape the server writes', () => {
		expect(normalize({ sections: [ONE] })).toEqual([ONE]);
	});

	it('reads every section the file has accumulated', () => {
		const sections = normalize({ sections: [ONE, TWO] });
		expect(sections.map((section) => section.title)).toEqual(['One', 'Two']);
	});

	it('drops rows it cannot use rather than failing the read', () => {
		// The file is machine-written and may be read mid-rewrite.
		const sections = normalize({
			sections: [
				{
					title: 'One',
					start: 0,
					end: 4,
					lines: [{ line: 1, share: 50 }, 'not a row', { share: 50 }, { line: 3, share: 50 }],
				},
			],
		});
		expect(sections[0].lines).toEqual([
			{ line: 1, share: 50 },
			{ line: 3, share: 50 },
		]);
	});

	it('drops a section with no line numbers and keeps the rest', () => {
		const sections = normalize({ sections: [{ title: 'Nowhere' }, TWO] });
		expect(sections.map((section) => section.title)).toEqual(['Two']);
	});

	it('reads a section with no scored lines as empty, not as absent', () => {
		const sections = normalize({
			sections: [{ title: 'One', start: 1, end: 1, displacement: 0, lines: [] }],
		});
		expect(sections).toHaveLength(1);
		expect(sections[0].lines).toEqual([]);
	});

	it('gives an empty list back when there is nothing to read', () => {
		expect(normalize({})).toEqual([]);
		expect(normalize(null)).toEqual([]);
		expect(normalize({ sections: 'not a list' })).toEqual([]);
	});
});

describe('denormalize', () => {
	it('writes the shape normalize reads', () => {
		expect(normalize(denormalize([ONE, TWO]))).toEqual([ONE, TWO]);
	});

	it('writes an empty file rather than nothing when every score is gone', () => {
		expect(denormalize([])).toEqual({ sections: [] });
	});
});

describe('afterEdits', () => {
	it('drops the scores of a section that was written in', () => {
		// Line 4 is inside One. What was scored is no longer what is there.
		const after = afterEdits([ONE, TWO], [{ start: 4, end: 4, delta: 0 }]);
		expect(after.map((section) => section.title)).toEqual(['Two']);
	});

	it('drops a section edited through its heading', () => {
		// One hangs from line 2; retitling it rescores it.
		const after = afterEdits([ONE, TWO], [{ start: 2, end: 2, delta: 0 }]);
		expect(after.map((section) => section.title)).toEqual(['Two']);
	});

	it('leaves a section above the edit exactly as it was', () => {
		expect(afterEdits([ONE, TWO], [{ start: 10, end: 10, delta: 0 }])).toEqual([ONE]);
	});

	it('moves a section below the edit down with the prose', () => {
		const after = afterEdits([ONE, TWO], [{ start: 4, end: 4, delta: 2 }]);
		expect(after).toEqual([
			{
				...TWO,
				start: 11,
				end: 14,
				lines: [
					{ line: 11, share: 70 },
					{ line: 13, share: 30 },
				],
			},
		]);
	});

	it('moves a section up when lines are deleted above it', () => {
		const after = afterEdits([TWO], [{ start: 1, end: 3, delta: -2 }]);
		expect(after[0].start).toBe(7);
		expect(after[0].lines.map((entry) => entry.line)).toEqual([7, 9]);
	});

	it('gives the same list back when the edit reached nothing', () => {
		// An edit below every scored section changes neither their lines nor their
		// membership, and must not provoke a rewrite of the file.
		const sections = [ONE, TWO];
		expect(afterEdits(sections, [{ start: 20, end: 20, delta: 3 }])).toBe(sections);
	});

	it('applies several edits in one change against the document as it was', () => {
		// Both ranges are in pre-edit coordinates; taking the later one first is
		// what keeps the earlier one's line numbers meaning what they said.
		const after = afterEdits(
			[ONE, TWO],
			[
				{ start: 4, end: 4, delta: 1 },
				{ start: 10, end: 10, delta: 1 },
			]
		);
		expect(after).toEqual([]);
	});
});
