// The pure logic behind the Publish view: where the publication files sit beside
// the manuscript, and which of them the form is allowed to change.
//
// Deliberately free of the `vscode` module, so it can be unit tested without
// launching an editor. panel.ts wraps these paths in vscode.Uri at the call
// sites — the same split story_graph/model.ts keeps.

export interface PubSettings {
	title: string;
	author: string;
	language: string;
	cover: string;
}

export const DEFAULT_SETTINGS: PubSettings = {
	title: '',
	author: '',
	language: 'en',
	cover: '',
};

/** `story.md` sits next to `story.pub.yaml`, as `story.graph.yaml` does. */
export function pubPathFor(mdPath: string): string {
	return mdPath.replace(/\.md$/i, '') + '.pub.yaml';
}

/** `story.md` sits next to `story.blurb.md`. */
export function blurbPathFor(mdPath: string): string {
	return mdPath.replace(/\.md$/i, '') + '.blurb.md';
}

/**
 * The three free-text fields the form reports. Everything else — the cover,
 * chosen through a dialog rather than typed — is left to its own message, so a
 * stray key arriving from the webview can't overwrite it.
 */
export function readFields(
	raw: unknown
): Pick<PubSettings, 'title' | 'author' | 'language'> {
	const source = (raw ?? {}) as Record<string, unknown>;
	return {
		title: String(source.title ?? ''),
		author: String(source.author ?? ''),
		language: String(source.language ?? ''),
	};
}
