// The page the cell surface is drawn on, and the wire back to the host.
//
// Every other module in the webview reaches the document through here rather
// than calling `getElementById` where it stands, so that an element the page
// stops carrying is one broken import instead of a `null` that surfaces as a
// button which silently does nothing. page.ts is what serves this markup, and
// the webview's tests mount that exact page — so the two are checked against
// each other on every run.
//
// A leaf: it imports nothing of ours, so it is initialised before anything that
// reads it, whatever order the bundler settles on.

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

/** Tell the host something. The only way out of the webview. */
export function post(message: Record<string, unknown> & { type: string }): void {
	vscode.postMessage(message);
}

export const cellsEl = document.getElementById('cells') as HTMLElement;
export const menuEl = document.getElementById('menu') as HTMLElement;
export const toolbarEl = document.getElementById('toolbar') as HTMLElement;
export const statusEl = document.getElementById('doc-status') as HTMLElement;
export const whereEl = document.getElementById('doc-where') as HTMLElement;
export const findEl = document.getElementById('find') as HTMLElement;
export const findBoxEl = document.getElementById('find-box') as HTMLElement;
export const whatEl = document.getElementById('find-what') as HTMLInputElement;
export const withEl = document.getElementById('find-with') as HTMLInputElement;
export const countEl = document.getElementById('find-count') as HTMLElement;
export const replaceRowEl = document.getElementById('find-replace-row') as HTMLElement;
export const replaceToggleEl = document.getElementById('find-toggle') as HTMLElement;
export const checkEl = document.getElementById('check') as HTMLElement;
export const tipEl = document.getElementById('mark-tip') as HTMLElement;
