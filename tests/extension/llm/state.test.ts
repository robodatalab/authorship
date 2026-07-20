import { describe, expect, it } from 'vitest';

import { phaseFor, renderStatus } from '../../../extension/llm/state';

describe('phaseFor', () => {
	it('maps what the server reports', () => {
		expect(phaseFor('ready')).toBe('ready');
		expect(phaseFor('downloading')).toBe('downloading');
	});

	it('collapses the two not-usable-yet states', () => {
		expect(phaseFor('starting')).toBe('loading');
		expect(phaseFor('loading')).toBe('loading');
	});

	it('treats no answer as offline', () => {
		expect(phaseFor(undefined)).toBe('offline');
		expect(phaseFor('something else')).toBe('offline');
	});

	it('treats a stopped worker as offline', () => {
		expect(phaseFor('stopped')).toBe('offline');
	});
});

describe('renderStatus', () => {
	it('does not claim the model is off while it is downloading', () => {
		const display = renderStatus('downloading', 'Qwen/Qwen3.5-4B');
		expect(display.text).not.toMatch(/off/i);
		expect(display.tooltip).toContain('Qwen/Qwen3.5-4B');
	});

	it('names the extension, not the model, in every state', () => {
		for (const phase of ['offline', 'downloading', 'loading', 'ready'] as const) {
			expect(renderStatus(phase, 'm').text).toMatch(/^\$\(book\) Authorship: /);
		}
	});

	it('reads as ok when working, rather than talking about the model', () => {
		expect(renderStatus('ready', 'm').text).toBe('$(book) Authorship: ok');
	});

	it('never offers to start a server the extension does not start', () => {
		for (const phase of ['offline', 'downloading', 'loading', 'ready'] as const) {
			expect(renderStatus(phase, 'm').tooltip).not.toMatch(/click/i);
		}
	});

	it('distinguishes downloading from loading', () => {
		expect(renderStatus('downloading', 'm').text).not.toEqual(
			renderStatus('loading', 'm').text
		);
	});

	it('names the model once it is serving', () => {
		expect(renderStatus('ready', 'Qwen/Qwen3.5-4B').tooltip).toContain('Qwen/Qwen3.5-4B');
	});
});
