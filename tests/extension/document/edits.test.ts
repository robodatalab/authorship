import { describe, expect, it } from 'vitest';

import { editsIn } from '../../../extension/document/edits';

function change(startLine: number, endLine: number, text: string) {
	return { range: { start: { line: startLine }, end: { line: endLine } }, text };
}

describe('editsIn — what an edit did to the line numbers below it', () => {
	it('typing inside a line changes nothing below it', () => {
		expect(editsIn([change(4, 4, 'x')])).toEqual([{ start: 4, end: 4, delta: 0 }]);
	});

	it('a newline gains the document a line', () => {
		expect(editsIn([change(4, 4, '\n')])).toEqual([{ start: 4, end: 4, delta: 1 }]);
	});

	it('pasting several lines gains all of them', () => {
		expect(editsIn([change(4, 4, 'a\nb\nc')])).toEqual([{ start: 4, end: 4, delta: 2 }]);
	});

	it('deleting across lines loses them', () => {
		// Three lines replaced by nothing leaves one where there were three.
		expect(editsIn([change(4, 6, '')])).toEqual([{ start: 4, end: 6, delta: -2 }]);
	});

	it('replacing a stretch with the same number of lines moves nothing', () => {
		expect(editsIn([change(4, 6, 'a\nb\nc')])).toEqual([{ start: 4, end: 6, delta: 0 }]);
	});

	it('every change in the event is read, and each against the document as it was', () => {
		expect(editsIn([change(0, 0, '\n'), change(10, 10, '')])).toEqual([
			{ start: 0, end: 0, delta: 1 },
			{ start: 10, end: 10, delta: 0 },
		]);
	});

	it('an event that changed nothing yields nothing', () => {
		expect(editsIn([])).toEqual([]);
	});
});
