// The graph view, running inside the webview.
//
// Everything here is DOM and events: turning the laid-out layer into SVG, the
// pan/zoom gesture, and the message channel to the extension host. The decisions
// live next door — geometry in view_layout.ts, layers and selection in
// view_state.ts — so this file stays thin enough to judge by eye.

import { elapsedSince } from '../llm/activity';
import type { LineSpan, NodeFields } from './model';
import { GraphViewState } from './view_state';
import { boundsOf, edgePath, layout, LINE_H, PAD_X, PAD_Y, type PlacedNode } from './view_layout';

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const state = new GraphViewState();

const svg = document.getElementById('canvas') as unknown as SVGSVGElement;
const viewport = document.getElementById('viewport') as unknown as SVGGElement;
const status = document.getElementById('status') as HTMLElement;
const layerBar = document.getElementById('layers') as HTMLElement;
const buildBar = document.getElementById('build') as HTMLElement;
const buildLabel = document.getElementById('build-label') as HTMLElement;
const editToggle = document.getElementById('edit-toggle') as HTMLButtonElement;
const addNodeButton = document.getElementById('add-node') as HTMLButtonElement;
const nodeEditor = document.getElementById('node-editor') as HTMLElement;
const edTitle = document.getElementById('ed-title') as HTMLInputElement;
const edGroup = document.getElementById('ed-group') as HTMLInputElement;
const edStart = document.getElementById('ed-start') as HTMLInputElement;
const edEnd = document.getElementById('ed-end') as HTMLInputElement;
const edSave = document.getElementById('ed-save') as HTMLButtonElement;
const edCancel = document.getElementById('ed-cancel') as HTMLButtonElement;
const edDelete = document.getElementById('ed-delete') as HTMLButtonElement;

/** Current pan/zoom, applied as a transform on the viewport group. */
const view = { k: 1, x: 0, y: 0 };

/** Laid-out nodes of the layer on screen right now. */
let placed = new Map<string, PlacedNode>();

/** The last read that failed. Cleared by a graph arriving, or by a build starting. */
let failure: string | null = null;

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------
//
// Off by default: with it off the panel is exactly the navigation viewer it was,
// so a graph can't be changed by accident. On, three affordances appear — a
// connect handle on each node, a fat hit-target over each edge, and the Add-node
// button — and double-click opens the node editor. Every change mutates the local
// model for instant feedback and is posted to the host, which writes it; the
// file watcher then reloads the same bytes back, so the save confirms itself.

/** Whether edits are live. Toggled by the Edit button. */
let editing = false;

/** The node the floating editor is open for, or null when it is closed. */
let editingNodeId: string | null = null;

/** Index of the edge picked for deletion, or null. View-local: it never leaves
 *  this panel, so it lives here rather than in the shared state. */
let selectedEdge: number | null = null;

/** The layer the viewport was last fitted to. A re-render of the same layer — an
 *  edit, or a background reload — keeps the user's pan and zoom; only a switch or
 *  the first paint recentres, so a run of edits doesn't keep yanking it back. */
let fittedLayerId: string | null = null;

window.addEventListener('message', (event: MessageEvent) => {
	const message = event.data;
	if (message.type === 'graph') {
		failure = null;
		state.setLayers(message.layers ?? []);
		renderLayerBar();
		renderLayer();
		reconcileEditing();
	} else if (message.type === 'active') {
		state.applyActive(message.active ?? {}, Boolean(message.keepSelection));
		applySelection();
	} else if (message.type === 'build') {
		setBuilding(message.building ? startOf(message.startedAt) : null);
	} else if (message.type === 'error') {
		failure = message.message;
		updateStatus();
	}
});

// ---------------------------------------------------------------------------
// Rebuilds
// ---------------------------------------------------------------------------

/**
 * Show that the graph is being rebuilt.
 *
 * Two things say it, because they say different halves. The graph dims: what is
 * drawn is the previous answer, and a rebuild that ends up changing little would
 * otherwise be indistinguishable from one that never ran. And the count climbs:
 * the model can take minutes on a long manuscript, so the only honest report is
 * how long it has been going — there is no progress to report from inside a
 * single generation, and inventing a bar for it would be a lie.
 */
let buildStartedAt: number | null = null;
let buildTimer: number | undefined;

function setBuilding(startedAt: number | null): void {
	buildStartedAt = startedAt;
	window.clearInterval(buildTimer);
	buildTimer = undefined;

	if (startedAt === null) {
		buildBar.hidden = true;
		document.body.classList.remove('building');
		updateStatus();
		return;
	}

	// Whatever the last read of the file had to say, this build is about to
	// answer it.
	failure = null;
	buildBar.hidden = false;
	document.body.classList.add('building');
	showElapsed();
	buildTimer = window.setInterval(showElapsed, 1000);
	updateStatus();
}

function showElapsed(): void {
	if (buildStartedAt === null) {
		return;
	}
	// The first build is a different wait from the rest — there is nothing on
	// screen it is going to replace.
	const verb = state.getLayers().length > 0 ? 'Rebuilding' : 'Building';
	buildLabel.textContent = `${verb}… ${elapsedSince(buildStartedAt, Date.now())}`;
}

/**
 * What the panel says when there is no picture — or something is wrong with the
 * one there is.
 *
 * Three things can be true at once: a build is running, there is no graph on
 * disk, and the last read failed. Reporting whichever message arrived last is
 * what made a first build show as a missing-file error for the whole time it ran.
 */
function updateStatus(): void {
	const empty = placed.size === 0;
	if (failure !== null) {
		showStatus(failure, empty);
	} else if (!empty) {
		hideStatus();
	} else if (state.getLayers().length > 0) {
		showStatus('No nodes in this graph file.', true);
	} else if (buildStartedAt !== null) {
		showStatus(
			'Building the story graph. The model reads the whole manuscript, so this takes a few minutes.',
			true
		);
	} else {
		showStatus('No story graph yet. Save the manuscript to build one.', true);
	}
}

/** A build we were told about without a start time is one that started now. */
function startOf(value: unknown): number {
	const startedAt = Number(value);
	return Number.isFinite(startedAt) ? startedAt : Date.now();
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

function renderLayerBar(): void {
	while (layerBar.firstChild) {
		layerBar.removeChild(layerBar.firstChild);
	}

	const layers = state.getLayers();
	// Nothing to switch between when there's only one.
	layerBar.hidden = layers.length < 2;
	if (layerBar.hidden) {
		return;
	}

	for (const layer of layers) {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = `Layer ${layer.id}`;
		const current = layer.id === state.getCurrentLayerId();
		button.classList.toggle('current', current);
		button.setAttribute('aria-pressed', String(current));
		button.addEventListener('click', () => switchTo(layer.id));
		layerBar.appendChild(button);
	}
}

function switchTo(id: string): void {
	if (!state.switchTo(id)) {
		return;
	}
	renderLayerBar();
	renderLayer();
	sendSelection();
}

/** Push the lines of whatever is selected right now to the manuscript. */
function sendSelection(): void {
	const ranges: LineSpan[] = state.selectedSpans();
	vscode.postMessage({ type: 'select', ranges });
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function renderLayer(): void {
	const layer = state.getCurrentLayer();
	placed = layer ? layout(layer) : new Map();

	while (viewport.firstChild) {
		viewport.removeChild(viewport.firstChild);
	}

	if (!layer || placed.size === 0) {
		updateStatus();
		return;
	}
	updateStatus();

	// Edges first so nodes paint over their endpoints.
	const edgeLayer = svgEl('g');
	layer.edges.forEach((edge, index) => {
		const from = placed.get(edge.from);
		const to = placed.get(edge.to);
		if (!from || !to) {
			return;
		}
		const d = edgePath(from, to);

		// The whole edge — a fat invisible hit-path (edit mode only) under the
		// drawn curve — lives in one group so selection and deletion key off it.
		const group = svgEl('g');
		group.setAttribute('class', 'edge-group');
		group.dataset.index = String(index);
		group.dataset.from = edge.from;
		group.dataset.to = edge.to;

		if (editing) {
			const hit = svgEl('path');
			hit.setAttribute('class', 'edge-hit');
			hit.setAttribute('d', d);
			group.appendChild(hit);
		}

		const path = svgEl('path');
		path.setAttribute('class', 'edge');
		path.setAttribute('d', d);
		path.setAttribute('marker-end', 'url(#arrow)');
		if (edge.group !== undefined) {
			path.style.setProperty('--group-stroke', groupStyle(edge.group).border);
		}
		group.appendChild(path);
		edgeLayer.appendChild(group);
	});
	viewport.appendChild(edgeLayer);

	for (const item of placed.values()) {
		viewport.appendChild(nodeEl(item));
	}

	applySelection();

	// Recentre only when the layer on screen actually changes; otherwise leave
	// the viewport where the user left it (see fittedLayerId).
	if (fittedLayerId !== layer.id) {
		fittedLayerId = layer.id;
		fit();
	} else {
		applyView();
	}
}

function nodeEl(item: PlacedNode): SVGGElement {
	const group = svgEl('g');
	group.setAttribute('class', 'node');
	group.setAttribute('transform', `translate(${item.x},${item.y})`);
	group.dataset.id = item.id;
	if (item.group !== undefined) {
		const { fill, border } = groupStyle(item.group);
		group.style.setProperty('--group-fill', fill);
		group.style.setProperty('--group-border', border);
	}

	const rect = svgEl('rect');
	rect.setAttribute('width', String(item.w));
	rect.setAttribute('height', String(item.h));
	rect.setAttribute('rx', '6');
	group.appendChild(rect);

	const text = svgEl('text');
	text.setAttribute('x', String(PAD_X));
	text.setAttribute('y', String(PAD_Y + LINE_H * 0.75));
	item.lines.forEach((line, index) => {
		const tspan = svgEl('tspan');
		tspan.setAttribute('x', String(PAD_X));
		if (index > 0) {
			tspan.setAttribute('dy', String(LINE_H));
		}
		tspan.textContent = line;
		text.appendChild(tspan);
	});
	group.appendChild(text);

	const title = svgEl('title');
	title.textContent = `${item.title} — lines ${item.start}–${item.end}`;
	group.appendChild(title);

	// The dot an edge is dragged out of, at the foot of the box where edges leave.
	if (editing) {
		const handle = svgEl('circle');
		handle.setAttribute('class', 'handle');
		handle.setAttribute('cx', String(item.w / 2));
		handle.setAttribute('cy', String(item.h));
		handle.setAttribute('r', '6');
		group.appendChild(handle);
	}

	// Selection is driven from the pointer handlers below rather than a click
	// listener here — see the note there about pointer capture.
	return group as SVGGElement;
}

/** A distinct hue per plot group: a filled background and a solid accent border. */
function groupStyle(group: number): { fill: string; border: string } {
	const hue = Math.round((group * 137.5) % 360);
	return {
		fill: `hsla(${hue}, 70%, 50%, 0.28)`,
		border: `hsl(${hue}, 65%, 45%)`,
	};
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function select(id: string): void {
	if (!state.selectNode(id)) {
		return;
	}
	selectedEdge = null;
	applySelection();
	sendSelection();
}

function applySelection(): void {
	const selected = state.getSelectedIds();
	const active = state.getActiveIds();

	for (const group of viewport.querySelectorAll<SVGGElement>('.node')) {
		const id = group.dataset.id ?? '';
		group.classList.toggle('selected', selected.has(id));
		group.classList.toggle('active', active.has(id));
	}
	for (const group of viewport.querySelectorAll<SVGGElement>('.edge-group')) {
		const incident =
			selected.has(group.dataset.from ?? '') || selected.has(group.dataset.to ?? '');
		group.classList.toggle('incident', selected.size > 0 && incident);
		group.classList.toggle('selected', editing && selectedEdge === Number(group.dataset.index));
	}
}

// ---------------------------------------------------------------------------
// Pan and zoom
// ---------------------------------------------------------------------------

function applyView(): void {
	viewport.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
}

/** Scale the whole graph to fit, then centre it. */
function fit(): void {
	const bounds = boundsOf(placed.values());
	if (!bounds) {
		return;
	}

	const margin = 28;
	const box = svg.getBoundingClientRect();
	const k = Math.min(
		2,
		(box.width - margin * 2) / Math.max(1, bounds.maxX - bounds.minX),
		(box.height - margin * 2) / Math.max(1, bounds.maxY - bounds.minY)
	);
	view.k = Math.max(0.2, k);
	view.x = box.width / 2 - ((bounds.minX + bounds.maxX) / 2) * view.k;
	view.y = box.height / 2 - ((bounds.minY + bounds.maxY) / 2) * view.k;
	applyView();
}

svg.addEventListener(
	'wheel',
	(event: WheelEvent) => {
		event.preventDefault();
		const box = svg.getBoundingClientRect();
		const px = event.clientX - box.left;
		const py = event.clientY - box.top;
		const factor = Math.exp(-event.deltaY * 0.0015);
		const k = Math.min(4, Math.max(0.1, view.k * factor));

		// Keep the point under the cursor pinned while the scale changes.
		view.x = px - ((px - view.x) * k) / view.k;
		view.y = py - ((py - view.y) * k) / view.k;
		view.k = k;
		applyView();
	},
	{ passive: false }
);

/** How far the pointer may drift before a press counts as a pan, not a click. */
const DRAG_THRESHOLD = 4;

interface Press {
	pointerId: number;
	px: number;
	py: number;
	x: number;
	y: number;
	nodeId: string | null;
	edgeIndex: number | null;
	panning: boolean;
}

/** An edge being dragged out from a node's handle, with the preview line drawn
 *  while it looks for a target. */
interface Linking {
	pointerId: number;
	sourceId: string;
	line: SVGPathElement;
}

/**
 * Panning and node selection share one gesture, so both live here.
 *
 * They can't be split into "pan on the background, click on a node": calling
 * setPointerCapture retargets the following `click` to the capture element, so a
 * click listener on the node never hears about it. Instead we track the press
 * ourselves and only capture the pointer once it has moved far enough to be a
 * drag — a press that never moves is a selection.
 *
 * Editing adds one more thing a press can be: a drag off a node's handle draws a
 * new edge instead of panning. That is decided up front from where the press
 * lands, and then runs on its own state, so the pan/select path is untouched.
 */
let press: Press | null = null;
let linking: Linking | null = null;

svg.addEventListener('pointerdown', (event: PointerEvent) => {
	if (event.button !== 0) {
		return;
	}
	const target = event.target as Element | null;

	// A press starting on a connect handle drags out an edge rather than panning.
	if (editing) {
		const handle = target?.closest?.('.handle');
		const sourceNode = handle?.closest?.('.node') as SVGGElement | null;
		const sourceId = sourceNode?.dataset.id;
		if (handle && sourceId) {
			startLinking(event, sourceId);
			return;
		}
	}

	const group = target?.closest?.('.node') as SVGGElement | null;
	const edgeGroup = group ? null : (target?.closest?.('.edge-group') as SVGGElement | null);
	press = {
		pointerId: event.pointerId,
		px: event.clientX,
		py: event.clientY,
		x: view.x,
		y: view.y,
		nodeId: group?.dataset.id ?? null,
		edgeIndex: editing && edgeGroup ? Number(edgeGroup.dataset.index) : null,
		panning: false,
	};
});

svg.addEventListener('pointermove', (event: PointerEvent) => {
	if (linking) {
		updateLinking(event);
		return;
	}
	if (!press) {
		return;
	}
	const dx = event.clientX - press.px;
	const dy = event.clientY - press.py;

	if (!press.panning) {
		if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
			return;
		}
		// Now it's definitely a drag; capture so it survives leaving the panel.
		press.panning = true;
		svg.setPointerCapture(press.pointerId);
		svg.classList.add('panning');
	}

	view.x = press.x + dx;
	view.y = press.y + dy;
	applyView();
});

svg.addEventListener('pointerup', (event: PointerEvent) => {
	if (linking) {
		finishLinking(event);
		return;
	}
	if (!press) {
		return;
	}
	if (press.panning) {
		svg.releasePointerCapture(press.pointerId);
		svg.classList.remove('panning');
	} else if (press.nodeId !== null) {
		select(press.nodeId);
	} else if (press.edgeIndex !== null) {
		selectEdge(press.edgeIndex);
	} else if (editing) {
		// A press on empty canvas drops the edge selection.
		selectedEdge = null;
		applySelection();
	}
	press = null;
});

svg.addEventListener('pointercancel', () => {
	if (linking) {
		cancelLinking();
	}
	if (press && press.panning) {
		svg.releasePointerCapture(press.pointerId);
		svg.classList.remove('panning');
	}
	press = null;
});

svg.addEventListener('dblclick', (event: MouseEvent) => {
	if (!editing) {
		return;
	}
	const target = event.target as Element | null;
	const id = (target?.closest?.('.node') as SVGGElement | null)?.dataset.id;
	if (id) {
		openEditor(id);
	}
});

window.addEventListener('resize', () => fit());

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

editToggle.addEventListener('click', () => setEditing(!editing));
addNodeButton.addEventListener('click', addNode);
edSave.addEventListener('click', commitEditor);
edCancel.addEventListener('click', closeEditor);
edDelete.addEventListener('click', deleteEditingNode);

/**
 * Delete removes the picked edge; Escape drops the picked edge or closes the
 * editor; Enter commits it. Only while editing, and edge deletion never fires
 * from inside the editor's own inputs (the editor branch returns first).
 */
window.addEventListener('keydown', (event: KeyboardEvent) => {
	if (!editing) {
		return;
	}
	if (editingNodeId !== null) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitEditor();
		} else if (event.key === 'Escape') {
			closeEditor();
		}
		return;
	}
	if (event.key === 'Escape') {
		selectedEdge = null;
		applySelection();
	} else if (event.key === 'Delete' || event.key === 'Backspace') {
		deleteSelectedEdge();
	}
});

function setEditing(on: boolean): void {
	editing = on;
	editToggle.setAttribute('aria-pressed', String(on));
	editToggle.classList.toggle('current', on);
	addNodeButton.hidden = !on;
	document.body.classList.toggle('editing', on);
	if (!on) {
		closeEditor();
		selectedEdge = null;
	}
	renderLayer();
}

/** After a reload, close the editor if its node is gone and drop an edge
 *  selection that now points past the end of the list. */
function reconcileEditing(): void {
	if (selectedEdge !== null && selectedEdge >= (state.getCurrentLayer()?.edges.length ?? 0)) {
		selectedEdge = null;
	}
	if (editingNodeId !== null) {
		if (state.getCurrentLayer()?.nodes.some((node) => node.id === editingNodeId)) {
			positionEditor();
		} else {
			closeEditor();
		}
	}
	applySelection();
}

/** Add a node, seeded from the picked lines if any, and open it for editing. */
function addNode(): void {
	const [span] = state.getAnchor();
	const seed = span ?? { start: 1, end: 1 };
	const id = state.addNode({ title: 'New node', start: seed.start, end: seed.end });
	renderLayer();
	pushEdit();
	openEditor(id);
}

function openEditor(id: string): void {
	const node = state.getCurrentLayer()?.nodes.find((candidate) => candidate.id === id);
	if (!node) {
		return;
	}
	editingNodeId = id;
	selectedEdge = null;
	edTitle.value = node.title;
	edGroup.value = node.group !== undefined ? String(node.group) : '';
	edStart.value = String(node.start);
	edEnd.value = String(node.end);
	nodeEditor.hidden = false;
	positionEditor();
	applySelection();
	edTitle.focus();
	edTitle.select();
}

function commitEditor(): void {
	if (editingNodeId === null) {
		return;
	}
	const fields = readEditorFields();
	if (!fields) {
		return;
	}
	state.updateNode(editingNodeId, fields);
	closeEditor();
	renderLayer();
	pushEdit();
}

function deleteEditingNode(): void {
	if (editingNodeId === null) {
		return;
	}
	state.deleteNode(editingNodeId);
	closeEditor();
	renderLayer();
	pushEdit();
}

function closeEditor(): void {
	editingNodeId = null;
	nodeEditor.hidden = true;
}

/**
 * Read the form. Start and end are normalized to a valid span; a blank or
 * unreadable group means no group, which is how the group is cleared.
 */
function readEditorFields(): NodeFields | null {
	const start = Number(edStart.value);
	const end = Number(edEnd.value);
	if (!Number.isFinite(start) || !Number.isFinite(end)) {
		return null;
	}
	const groupText = edGroup.value.trim();
	const groupValue = Number(groupText);
	const group = groupText !== '' && Number.isFinite(groupValue) ? groupValue : undefined;
	const lo = Math.max(1, Math.min(start, end));
	const hi = Math.max(lo, Math.max(start, end));
	return { title: edTitle.value.trim(), start: lo, end: hi, group };
}

/** Float the editor over the node it edits, kept inside the panel. */
function positionEditor(): void {
	if (editingNodeId === null) {
		return;
	}
	const item = placed.get(editingNodeId);
	if (!item) {
		return;
	}
	const box = svg.getBoundingClientRect();
	const w = nodeEditor.offsetWidth || 240;
	const h = nodeEditor.offsetHeight || 160;
	const left = Math.max(8, Math.min(view.x + item.x * view.k, box.width - w - 8));
	const top = Math.max(8, Math.min(view.y + item.y * view.k, box.height - h - 8));
	nodeEditor.style.left = `${left}px`;
	nodeEditor.style.top = `${top}px`;
}

function selectEdge(index: number): void {
	closeEditor();
	selectedEdge = index;
	applySelection();
}

function deleteSelectedEdge(): void {
	if (selectedEdge === null) {
		return;
	}
	state.deleteEdgeAt(selectedEdge);
	selectedEdge = null;
	renderLayer();
	pushEdit();
}

// -- edge creation, dragged from a node's handle ----------------------------

function startLinking(event: PointerEvent, sourceId: string): void {
	closeEditor();
	const line = svgEl('path');
	line.setAttribute('class', 'link-preview');
	line.setAttribute('marker-end', 'url(#arrow)');
	viewport.appendChild(line);
	linking = { pointerId: event.pointerId, sourceId, line };
	svg.setPointerCapture(event.pointerId);
	updateLinking(event);
}

function updateLinking(event: PointerEvent): void {
	if (!linking) {
		return;
	}
	const source = placed.get(linking.sourceId);
	if (!source) {
		return;
	}
	const x1 = source.x + source.w / 2;
	const y1 = source.y + source.h;
	const [x2, y2] = toViewport(event.clientX, event.clientY);
	const bend = Math.max(18, Math.abs(y2 - y1) / 2);
	linking.line.setAttribute(
		'd',
		`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
	);
}

function finishLinking(event: PointerEvent): void {
	if (!linking) {
		return;
	}
	const { sourceId } = linking;
	cancelLinking();
	const targetId = nodeIdAt(event.clientX, event.clientY);
	if (targetId && targetId !== sourceId) {
		state.addEdge(sourceId, targetId);
		renderLayer();
		pushEdit();
	}
}

function cancelLinking(): void {
	if (!linking) {
		return;
	}
	try {
		svg.releasePointerCapture(linking.pointerId);
	} catch {
		// On a cancel the pointer may already be gone; there is nothing to release.
	}
	linking.line.remove();
	linking = null;
}

/** Screen point to viewport-local coordinates — the inverse of the viewport
 *  transform, so the preview line meets the pointer. */
function toViewport(clientX: number, clientY: number): [number, number] {
	const box = svg.getBoundingClientRect();
	return [(clientX - box.left - view.x) / view.k, (clientY - box.top - view.y) / view.k];
}

function nodeIdAt(clientX: number, clientY: number): string | null {
	const el = document.elementFromPoint(clientX, clientY) as Element | null;
	return (el?.closest?.('.node') as SVGGElement | null)?.dataset.id ?? null;
}

/** Hand the whole edited model to the host to write beside the manuscript. */
function pushEdit(): void {
	vscode.postMessage({ type: 'edit', layers: state.getLayers() });
}

// ---------------------------------------------------------------------------
// Bits and pieces
// ---------------------------------------------------------------------------

function svgEl<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
	return document.createElementNS('http://www.w3.org/2000/svg', name);
}

/**
 * `empty` means there is no graph underneath. A line pinned to the top edge is
 * right when it is annotating a picture, and wrong when it is all there is —
 * over an empty canvas it also collides with the rebuild badge.
 */
function showStatus(text: string, empty = false): void {
	status.textContent = text;
	status.classList.toggle('empty', empty);
	status.hidden = false;
}

function hideStatus(): void {
	status.hidden = true;
}

// Everything worth drawing is held by the host, and anything it posted before
// this script ran is gone. Asking on load is what lets a panel opened during a
// rebuild show one.
vscode.postMessage({ type: 'ready' });
