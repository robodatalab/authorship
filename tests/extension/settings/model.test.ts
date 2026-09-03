import { afterEach, describe, expect, it } from 'vitest';

import {
	SETTINGS_FILE,
	SETTINGS_FOLDER,
	EMPTY_TEMPLATES,
	parseSettings,
	settingsText,
	templates,
	useTemplates,
} from '../../../extension/settings/model';

// The store is module state that every other test in the process reads, so a
// test that changes it puts it back.
afterEach(() => useTemplates(EMPTY_TEMPLATES));

describe('where a workspace keeps its templates', () => {
	it('keeps them beside the stories, in the workspace itself', () => {
		// Not in VS Code's settings, which sync between machines and belong to the
		// person rather than the book. A disclaimer is part of the repository the
		// story is in.
		expect(`${SETTINGS_FOLDER}/${SETTINGS_FILE}`).toBe('.author/settings.json');
	});
});

describe('what Authorship starts a workspace with', () => {
	it('has no words of its own for any of these pages', () => {
		// The point of the file. A disclaimer written into the extension is the
		// extension's opinion of what a story warns its readers about, and an
		// author page it could guess at does not exist. Every word on these pages
		// is the author's, so a workspace that has written nothing gets nothing.
		expect(EMPTY_TEMPLATES).toEqual({
			disclaimer: { title: '', text: '' },
			about: { text: '', kdp: '', website: '', substack: '' },
			'title-page': { author: '', publisher: '' },
		});
	});

	it('names every page an author may fill in, so the file shows the shape of it', () => {
		// Empty is not the same as absent: the slots are there to be written in,
		// and a file that listed none of them would leave the author guessing.
		expect(Object.keys(EMPTY_TEMPLATES)).toEqual([
			'disclaimer',
			'about',
			'title-page',
		]);
	});
});

describe('parseSettings — reading what the author wrote', () => {
	it('takes what the file says', () => {
		const said = parseSettings(
			JSON.stringify({
				templates: {
					disclaimer: { title: 'A Word Before', text: 'All of it invented.' },
					about: {
						text: 'Writes at night.',
						kdp: 'https://amazon.com/author/x',
						website: 'https://example.com',
						substack: 'https://x.substack.com',
					},
					'title-page': { author: 'A. Writer', publisher: 'Nobody' },
				},
			})
		);
		expect(said.disclaimer).toEqual({
			title: 'A Word Before',
			text: 'All of it invented.',
		});
		expect(said.about.text).toBe('Writes at night.');
		expect(said['title-page'].author).toBe('A. Writer');
	});

	it('takes what the file mentions and leaves the rest empty', () => {
		// A file naming one template is a file about one template. This is also
		// what lets a settings file written by an older version survive a newer
		// one adding a template to the list.
		const said = parseSettings('{"templates": {"disclaimer": {"title": "Warning"}}}');
		expect(said.disclaimer.title).toBe('Warning');
		expect(said.disclaimer.text).toBe('');
		expect(said.about).toEqual(EMPTY_TEMPLATES.about);
	});

	it('reads an empty file, and one with nothing of ours in it, as nothing said', () => {
		expect(parseSettings('{}')).toEqual(EMPTY_TEMPLATES);
		expect(parseSettings('{"templates": {}}')).toEqual(EMPTY_TEMPLATES);
		expect(parseSettings('{"something": "else"}')).toEqual(EMPTY_TEMPLATES);
	});

	it('ignores anything that is not text where text was expected', () => {
		const said = parseSettings(
			'{"templates": {"disclaimer": {"text": 12}, "about": ["not an object"]}}'
		);
		expect(said.disclaimer.text).toBe('');
		expect(said.about).toEqual(EMPTY_TEMPLATES.about);
	});

	it('reads a paragraph written a line to a line', () => {
		// The form these are written out in: JSON has no multi-line string, and a
		// disclaimer kept as one `\n`-riddled line is a disclaimer nobody edits.
		const said = parseSettings(
			JSON.stringify({
				templates: {
					disclaimer: { text: ['All of it invented.', '', 'Enjoy!'] },
				},
			})
		);
		expect(said.disclaimer.text).toBe('All of it invented.\n\nEnjoy!');
	});

	it('still reads a paragraph written as one string', () => {
		// A file typed by hand, or written by a version before the lists.
		const said = parseSettings('{"templates": {"disclaimer": {"text": "A\\nB"}}}');
		expect(said.disclaimer.text).toBe('A\nB');
	});

	it('reads no lines as nothing said, not as a blank line', () => {
		expect(parseSettings('{"templates": {"about": {"text": []}}}').about.text).toBe('');
	});

	it('ignores a list with something in it that is not a line', () => {
		const said = parseSettings('{"templates": {"disclaimer": {"text": ["A", 2]}}}');
		expect(said.disclaimer.text).toBe('');
	});

	it('refuses a file that is not JSON at all, rather than quietly ignoring it', () => {
		// The one thing the author has to be told about: a half-edited file that
		// silently fell back would look exactly like a template that did not work.
		expect(() => parseSettings('{ templates: ')).toThrow();
	});
});

describe('settingsText — writing the file out', () => {
	it('writes JSON a person can edit, and reads back what it wrote', () => {
		const text = settingsText(EMPTY_TEMPLATES);
		expect(text.startsWith('{\n  "templates"')).toBe(true);
		expect(text.endsWith('\n')).toBe(true);
		expect(parseSettings(text)).toEqual(EMPTY_TEMPLATES);
	});

	it('writes a page that has been written a line to a line', () => {
		// JSON has no multi-line string, and a disclaimer kept as one escaped line
		// is a disclaimer nobody will edit. This way it diffs a line at a time too.
		const text = settingsText({
			...EMPTY_TEMPLATES,
			disclaimer: { title: 'Disclaimer', text: 'All invented.\n\nEnjoy!' },
		});
		expect(text).toContain('"All invented."');
		expect(text).toContain('"Enjoy!"');
		expect(text).not.toContain('\\n');
	});

	it('writes a page nobody has written yet as an empty string, like every other empty slot', () => {
		// A new file is all empty slots, and they should all look alike — `[]`
		// sitting beside `""` reads as a different kind of nothing.
		const text = settingsText(EMPTY_TEMPLATES);
		expect(text).toContain('"text": ""');
		expect(text).not.toContain('[]');
	});

	it('names every template, so the file shows what there is to change', () => {
		const text = settingsText(EMPTY_TEMPLATES);
		for (const named of ['disclaimer', 'about', 'title-page']) {
			expect(text, named).toContain(`"${named}"`);
		}
	});
});

describe('the templates in use', () => {
	it('is nothing at all until a workspace says otherwise', () => {
		expect(templates()).toEqual(EMPTY_TEMPLATES);
	});

	it('is whatever was last read', () => {
		const said = parseSettings('{"templates": {"about": {"text": "Writes at night."}}}');
		useTemplates(said);
		expect(templates().about.text).toBe('Writes at night.');
	});
});
