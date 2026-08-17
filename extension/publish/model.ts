// The pure logic behind the Publish view: where the authorship file sits beside
// the manuscript.
//
// What the book says about itself used to be a form here and a `.pub.yaml`
// underneath it. It is now `<name>.authorship.md`, which the author edits like
// any other document — a book's title and its blurb are prose, and a panel that
// mirrors them is one more place for them to disagree. The server owns that
// file's shape; this module only knows its name, so nothing here can drift from
// how it is read.
//
// Deliberately free of the `vscode` module, so it can be unit tested without
// launching an editor. panel.ts wraps these paths in vscode.Uri at the call
// sites.

/** `story.md` sits next to `story.authorship.md`, as `story.graph.yaml` does. */
export function authorshipPathFor(mdPath: string): string {
	return mdPath.replace(/\.md$/i, '') + '.authorship.md';
}
