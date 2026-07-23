// The graph view, running inside the webview.
//
// Everything here is DOM and events: turning the laid-out layer into SVG, the
// pan/zoom gesture, and the message channel to the extension host. The decisions
// live next door — geometry in view_layout.ts, layers and selection in
// view_state.ts — so this file stays thin enough to judge by eye.

import { elapsedSince } from '../llm/activity';
import type { LineSpan } from './model';
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

/** Current pan/zoom, applied as a transform on the viewport group. */
const view = { k: 1, x: 0, y: 0 };

/** Laid-out nodes of the layer on screen right now. */
let placed = new Map<string, PlacedNode>();

/** The last read that failed. Cleared by a graph arriving, or by a build starting. */
let failure: string | null = null;

window.addEventListener('message', (event: MessageEvent) => {
	const message = event.data;
	if (message.type === 'graph') {
		failure = null;
		state.setLayers(message.layers ?? []);
		renderLayerBar();
		renderLayer();
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
	for (const edge of layer.edges) {
		const from = placed.get(edge.from);
		const to = placed.get(edge.to);
		if (!from || !to) {
			continue;
		}
		const path = svgEl('path');
		path.setAttribute('class', 'edge');
		path.setAttribute('d', edgePath(from, to));
		path.setAttribute('marker-end', 'url(#arrow)');
		path.dataset.from = edge.from;
		path.dataset.to = edge.to;
		if (edge.group !== undefined) {
			path.style.setProperty('--group-stroke', groupStyle(edge.group).border);
		}
		edgeLayer.appendChild(path);
	}
	viewport.appendChild(edgeLayer);

	for (const item of placed.values()) {
		viewport.appendChild(nodeEl(item));
	}

	applySelection();
	fit();
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
	for (const path of viewport.querySelectorAll<SVGPathElement>('.edge')) {
		const incident =
			selected.has(path.dataset.from ?? '') || selected.has(path.dataset.to ?? '');
		path.classList.toggle('incident', selected.size > 0 && incident);
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
	panning: boolean;
}

/**
 * Panning and node selection share one gesture, so both live here.
 *
 * They can't be split into "pan on the background, click on a node": calling
 * setPointerCapture retargets the following `click` to the capture element, so a
 * click listener on the node never hears about it. Instead we track the press
 * ourselves and only capture the pointer once it has moved far enough to be a
 * drag — a press that never moves is a selection.
 */
let press: Press | null = null;

svg.addEventListener('pointerdown', (event: PointerEvent) => {
	if (event.button !== 0) {
		return;
	}
	const target = event.target as Element | null;
	const group = target?.closest?.('.node') as SVGGElement | null;
	press = {
		pointerId: event.pointerId,
		px: event.clientX,
		py: event.clientY,
		x: view.x,
		y: view.y,
		nodeId: group?.dataset.id ?? null,
		panning: false,
	};
});

svg.addEventListener('pointermove', (event: PointerEvent) => {
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

svg.addEventListener('pointerup', () => {
	if (!press) {
		return;
	}
	if (press.panning) {
		svg.releasePointerCapture(press.pointerId);
		svg.classList.remove('panning');
	} else if (press.nodeId !== null) {
		select(press.nodeId);
	}
	press = null;
});

svg.addEventListener('pointercancel', () => {
	if (press && press.panning) {
		svg.releasePointerCapture(press.pointerId);
		svg.classList.remove('panning');
	}
	press = null;
});

window.addEventListener('resize', () => fit());

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
