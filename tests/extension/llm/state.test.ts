import { describe, expect, it } from 'vitest';

import { phaseFor, renderStatus } from '../../../extension/llm/state';

describe('phaseFor', () => {
	it('reads a serving model as ready', () => {
		expect(phaseFor('serving')).toBe('ready');
	});

	it('reads a download-progress report as downloading', () => {
		expect(phaseFor('0% downloaded')).toBe('downloading');
		expect(phaseFor('37% downloaded')).toBe('downloading');
		expect(phaseFor('100% downloaded')).toBe('downloading');
		expect(phaseFor('Qwen/Qwen3.5-4B: 37% downloaded')).toBe('downloading');
	});

	it('reads an unloaded model as unloaded, not offline', () => {
		expect(phaseFor('unloaded')).toBe('unloaded');
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
		const display = renderStatus('downloading');
		expect(display.text).not.toMatch(/off/i);
	});

	it('names the extension, not the model, in every state', () => {
		for (const phase of ['offline', 'downloading', 'ready'] as const) {
			expect(renderStatus(phase).text).toMatch(/^\$\(book\) Authorship: /);
		}
	});

	it('reads as ok when working, rather than talking about the model', () => {
		expect(renderStatus('ready').text).toBe('$(book) Authorship: ok');
	});

	it('never offers to start a server the extension does not start', () => {
		for (const phase of ['offline', 'downloading', 'ready'] as const) {
			expect(renderStatus(phase).tooltip).not.toMatch(/click/i);
		}
	});
});
