import { describe, expect, it } from 'vitest';

import { BuildActivity, elapsedSince } from '../../../extension/llm/activity';

describe('BuildActivity', () => {
	it('holds a build from start to finish', () => {
		const activity = new BuildActivity();
		expect(activity.any()).toBe(false);

		const build = activity.started('/story.md', 1000);
		expect(activity.get('/story.md')).toEqual({ path: '/story.md', startedAt: 1000 });
		expect(activity.any()).toBe(true);

		activity.finished(build);
		expect(activity.get('/story.md')).toBeUndefined();
		expect(activity.any()).toBe(false);
	});

	it('lets a newer build take the manuscript over', () => {
		const activity = new BuildActivity();
		activity.started('/story.md', 1000);
		activity.started('/story.md', 2000);

		expect(activity.get('/story.md')?.startedAt).toBe(2000);
	});

	// The whole reason `finished` takes the build rather than the path: the
	// superseded request unwinds afterwards, and it must not retire its replacement.
	it('ignores a superseded build retiring itself', () => {
		const activity = new BuildActivity();
		const first = activity.started('/story.md', 1000);
		const second = activity.started('/story.md', 2000);

		activity.finished(first);
		expect(activity.get('/story.md')).toBe(second);
		expect(activity.any()).toBe(true);
	});

	it('keeps manuscripts apart', () => {
		const activity = new BuildActivity();
		const one = activity.started('/one.md', 1000);
		activity.started('/two.md', 1000);

		activity.finished(one);
		expect(activity.get('/one.md')).toBeUndefined();
		expect(activity.get('/two.md')).toBeDefined();
	});

	it('announces which manuscript changed, and to what', () => {
		const activity = new BuildActivity();
		const seen: Array<[string, number | undefined]> = [];
		activity.onChange((path, build) => seen.push([path, build?.startedAt]));

		const build = activity.started('/story.md', 1000);
		activity.finished(build);

		expect(seen).toEqual([
			['/story.md', 1000],
			['/story.md', undefined],
		]);
	});

	it('stops announcing once a listener has unsubscribed', () => {
		const activity = new BuildActivity();
		let calls = 0;
		const stop = activity.onChange(() => calls++);

		activity.started('/story.md', 1000);
		stop();
		activity.started('/story.md', 2000);

		expect(calls).toBe(1);
	});
});

describe('elapsedSince', () => {
	it('counts seconds while there are only seconds to count', () => {
		expect(elapsedSince(1000, 1000)).toBe('0s');
		expect(elapsedSince(1000, 8000)).toBe('7s');
		expect(elapsedSince(0, 59_400)).toBe('59s');
	});

	it('breaks into minutes past the first one', () => {
		expect(elapsedSince(0, 60_000)).toBe('1m 00s');
		expect(elapsedSince(0, 95_000)).toBe('1m 35s');
		expect(elapsedSince(0, 600_000)).toBe('10m 00s');
	});

	// Wall clocks move backwards — a counter that shows a negative age of a build
	// that is plainly still running reads as a bug in the build, not the clock.
	it('never counts backwards', () => {
		expect(elapsedSince(5000, 1000)).toBe('0s');
	});
});
