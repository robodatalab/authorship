// What a workspace's boilerplate pages start life as, and the file they are kept
// in.
//
// A disclaimer, an About the Author page and the name on a title page are the
// same in every book one author writes and different for every author who writes
// one. Authorship has no words of its own for any of them, and should not: a
// disclaimer shipped with the extension is the extension's opinion of what a
// story warns its readers about, and it would be the wrong opinion for somebody.
//
// So what these pages say comes out of `.author/settings.json` beside the
// manuscripts — the author's to write, and their repository's to keep — or the
// page is added empty and they write it there.
//
// Deliberately free of both the `vscode` module and the DOM. The host reads the
// file and tells the page what it said, and the two build blank sections out of
// the same answer; `file.ts` beside this is the half that touches the disk.

/** The folder a workspace keeps its Authorship settings in. */
export const SETTINGS_FOLDER = '.author';

/** The file inside it. */
export const SETTINGS_FILE = 'settings.json';

/**
 * The pages a workspace fills in for itself, keyed by the kind of section each
 * one starts.
 *
 * Only the parts that are the *author's* rather than the story's. A title and a
 * date belong to one book and are typed into it; a name and a publisher are the
 * same on every title page in the workspace, so they are here.
 */
export interface Templates {
	/** The page the reader turns to before the story: its heading and its prose. */
	disclaimer: { title: string; text: string };
	/**
	 * The page at the back, in the author's own words, and where it sends the
	 * reader once the story has let them go.
	 */
	about: { text: string; kdp: string; website: string; substack: string };
	/** The two credits on a title page that are the author's and not the book's. */
	'title-page': { author: string; publisher: string };
}

/**
 * Nothing said, which is where every workspace starts and where one that has
 * written nothing stays.
 *
 * Also what goes into a new `.author/settings.json`: an empty slot for each
 * thing the author may fill in, so the file they first open shows them the
 * whole shape of what there is to write rather than an empty object they would
 * have to look up. No words of ours are ever among the answers.
 */
export const EMPTY_TEMPLATES: Templates = {
	disclaimer: { title: '', text: '' },
	about: { text: '', kdp: '', website: '', substack: '' },
	'title-page': { author: '', publisher: '' },
};

let inUse: Templates = EMPTY_TEMPLATES;

/** The templates blank sections are being built from now. */
export function templates(): Templates {
	return inUse;
}

/**
 * Build blank sections from these from here on.
 *
 * Module state rather than an argument threaded through every caller, because
 * `blank()` is reached from a menu item and from an export's layout plan and
 * neither has a workspace to hand. The host sets it from the document it is
 * about to act on; the page sets it from what the host last sent.
 */
export function useTemplates(said: Templates): void {
	inUse = said;
}

/**
 * The templates a settings file names. Whatever it leaves out is left empty.
 *
 * Read key by key rather than taken whole, so a file that mentions only the
 * disclaimer still parses — and so a file written by an older version survives a
 * newer one adding a template to this list.
 *
 * Prose may be written as one string or as a line to a line; see `worded`.
 *
 * Throws what `JSON.parse` throws for a file that is not JSON at all. That is
 * the one thing the author has to be told about rather than have quietly
 * ignored, and the caller is the half of this that can tell them.
 */
export function parseSettings(text: string): Templates {
	const said = within(JSON.parse(text) as unknown, 'templates');
	const disclaimer = within(said, 'disclaimer');
	const about = within(said, 'about');
	const titlePage = within(said, 'title-page');
	return {
		disclaimer: {
			title: worded(disclaimer, 'title'),
			text: worded(disclaimer, 'text'),
		},
		about: {
			text: worded(about, 'text'),
			kdp: worded(about, 'kdp'),
			website: worded(about, 'website'),
			substack: worded(about, 'substack'),
		},
		'title-page': {
			author: worded(titlePage, 'author'),
			publisher: worded(titlePage, 'publisher'),
		},
	};
}

/**
 * The settings file as it is written out.
 *
 * Two-space JSON with a newline at the end, which is what every other JSON file
 * in a VS Code project looks like — this one is edited by hand far more often
 * than it is read by us.
 *
 * A page that has been written goes out as a list of lines rather than as one
 * string, because a disclaimer kept as `"…everyone.\n\nThis story is a work
 * of…"` is a disclaimer nobody will edit, and a line to a line is also a line to
 * a line in the diff. One nobody has written yet goes out as `""`, so every
 * empty slot in a new file looks like every other one.
 */
export function settingsText(said: Templates): string {
	const written = {
		templates: {
			disclaimer: {
				title: said.disclaimer.title,
				text: prose(said.disclaimer.text),
			},
			about: {
				text: prose(said.about.text),
				kdp: said.about.kdp,
				website: said.about.website,
				substack: said.about.substack,
			},
			'title-page': said['title-page'],
		},
	};
	return JSON.stringify(written, null, 2) + '\n';
}

/** A page as the file holds it: a line to a line, and `""` until there is one. */
function prose(text: string): string | string[] {
	return text === '' ? '' : text.split('\n');
}

/** Whatever a settings file put under this name, if it put an object there. */
function within(said: unknown, name: string): unknown {
	return said !== null && typeof said === 'object'
		? (said as Record<string, unknown>)[name]
		: undefined;
}

/**
 * What a settings file said here, or nothing at all if it said nothing.
 *
 * A list of strings is read as a page of prose, a line to a line — the form
 * these are written out in, and the only shape a JSON file can hold a paragraph
 * in that an author is willing to edit by hand. One string is still one string,
 * so a file typed out by hand reads the same.
 */
function worded(said: unknown, name: string): string {
	const value = within(said, name);
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value) && value.every((line) => typeof line === 'string')) {
		return (value as string[]).join('\n');
	}
	return '';
}
