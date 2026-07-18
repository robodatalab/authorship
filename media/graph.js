// Story graph renderer.
//
// Runs inside the webview, so this is plain browser JS with no imports — it is
// loaded directly by a <script> tag rather than bundled. The extension host
// sends a normalized list of layers; everything below is layout, drawing and the
// pan/zoom/click handling on top of it.
//
// Node ids are only unique within a layer, so anything keyed by node id is kept
// per layer rather than globally.

(function () {
	const vscode = acquireVsCodeApi();

	const NODE_W = 190;
	const LINE_H = 16;
	const PAD_X = 12;
	const PAD_Y = 11;
	const GAP_X = 34;
	const GAP_Y = 54;
	const WRAP_AT = 24; // characters per line, roughly, at 12px

	const svg = document.getElementById('canvas');
	const viewport = document.getElementById('viewport');
	const status = document.getElementById('status');
	const layerBar = document.getElementById('layers');

	/** Current pan/zoom, applied as a transform on the viewport group. */
	let view = { k: 1, x: 0, y: 0 };

	let layers = [];
	let currentLayerId = null;
	/** layer id -> the node clicked in it. */
	let selectedByLayer = new Map();
	/** layer id -> set of nodes the manuscript selection touches. */
	let activeByLayer = new Map();
	/** Laid-out nodes of the layer on screen right now. */
	let placed = new Map();

	window.addEventListener('message', (event) => {
		const message = event.data;
		if (message.type === 'graph') {
			setLayers(message.layers || []);
		} else if (message.type === 'active') {
			// Moving in the manuscript drops the clicked node. A graph reload sets
			// keepSelection, since that isn't the user picking a side.
			activeByLayer = new Map(
				Object.entries(message.active || {}).map(([id, ids]) => [id, new Set(ids)])
			);
			if (!message.keepSelection) {
				selectedByLayer.clear();
			}
			applySelection();
		} else if (message.type === 'error') {
			showStatus(message.message);
		}
	});

	// -----------------------------------------------------------------------
	// Layers
	// -----------------------------------------------------------------------

	function setLayers(next) {
		layers = next;
		// Hold the current layer across reloads where it still exists, so a
		// background rewrite doesn't yank the view back to the first layer.
		if (!layers.some((layer) => layer.id === currentLayerId)) {
			currentLayerId = layers.length > 0 ? layers[0].id : null;
		}
		renderLayerBar();
		renderLayer();
	}

	function renderLayerBar() {
		while (layerBar.firstChild) {
			layerBar.removeChild(layerBar.firstChild);
		}
		// Nothing to switch between when there's only one.
		layerBar.hidden = layers.length < 2;
		if (layerBar.hidden) {
			return;
		}

		for (const layer of layers) {
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = `Layer ${layer.id}`;
			const current = layer.id === currentLayerId;
			button.classList.toggle('current', current);
			button.setAttribute('aria-pressed', String(current));
			button.addEventListener('click', () => switchTo(layer.id));
			layerBar.appendChild(button);
		}
	}

	function switchTo(id) {
		if (id === currentLayerId) {
			return;
		}
		currentLayerId = id;
		renderLayerBar();
		renderLayer();
	}

	function currentLayer() {
		return layers.find((layer) => layer.id === currentLayerId);
	}

	// -----------------------------------------------------------------------
	// Layout
	// -----------------------------------------------------------------------

	/**
	 * Layered top-to-bottom layout: an edge always points downward, so depth is
	 * the longest path to a node. Within a layer, nodes are ordered by where they
	 * appear in the manuscript, which keeps the picture stable across reloads and
	 * roughly matches reading order.
	 */
	function layout(layer) {
		const byId = new Map();
		for (const node of layer.nodes) {
			byId.set(node.id, {
				id: node.id,
				title: node.title,
				start: node.start,
				end: node.end,
				lines: wrap(node.title),
				depth: 0,
				x: 0,
				y: 0,
				w: NODE_W,
				h: 0,
			});
		}
		for (const item of byId.values()) {
			item.h = PAD_Y * 2 + item.lines.length * LINE_H;
		}

		// Relax depths until they stop moving. Capped at node count, which both
		// terminates and keeps a cyclic graph from spinning forever.
		for (let pass = 0; pass < byId.size; pass++) {
			let changed = false;
			for (const edge of layer.edges) {
				const from = byId.get(edge.from);
				const to = byId.get(edge.to);
				if (from && to && to.depth < from.depth + 1) {
					to.depth = from.depth + 1;
					changed = true;
				}
			}
			if (!changed) {
				break;
			}
		}

		const rows = new Map();
		for (const item of byId.values()) {
			const row = rows.get(item.depth);
			if (row) {
				row.push(item);
			} else {
				rows.set(item.depth, [item]);
			}
		}

		let y = 0;
		for (const depth of [...rows.keys()].sort((a, b) => a - b)) {
			const row = rows.get(depth);
			row.sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)));

			const width = row.length * NODE_W + (row.length - 1) * GAP_X;
			let x = -width / 2;
			let tallest = 0;
			for (const item of row) {
				item.x = x;
				item.y = y;
				x += NODE_W + GAP_X;
				tallest = Math.max(tallest, item.h);
			}
			y += tallest + GAP_Y;
		}

		return byId;
	}

	/** Greedy word wrap — titles are short, so this doesn't need to be clever. */
	function wrap(text) {
		const words = String(text ?? '').split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			return [''];
		}
		const lines = [];
		let line = words[0];
		for (let i = 1; i < words.length; i++) {
			if (line.length + 1 + words[i].length <= WRAP_AT) {
				line += ' ' + words[i];
			} else {
				lines.push(line);
				line = words[i];
			}
		}
		lines.push(line);
		return lines;
	}

	// -----------------------------------------------------------------------
	// Drawing
	// -----------------------------------------------------------------------

	function renderLayer() {
		const layer = currentLayer();
		placed = layer ? layout(layer) : new Map();

		while (viewport.firstChild) {
			viewport.removeChild(viewport.firstChild);
		}

		if (placed.size === 0) {
			showStatus('No nodes in this graph file.');
			return;
		}
		hideStatus();

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
			edgeLayer.appendChild(path);
		}
		viewport.appendChild(edgeLayer);

		for (const item of placed.values()) {
			viewport.appendChild(nodeEl(item));
		}

		applySelection();
		fit();
	}

	function nodeEl(item) {
		const group = svgEl('g');
		group.setAttribute('class', 'node');
		group.setAttribute('transform', `translate(${item.x},${item.y})`);
		group.dataset.id = item.id;

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
		return group;
	}

	/** A vertical-ish cubic curve from the bottom of `from` to the top of `to`. */
	function edgePath(from, to) {
		const x1 = from.x + from.w / 2;
		const y1 = from.y + from.h;
		const x2 = to.x + to.w / 2;
		const y2 = to.y;
		const bend = Math.max(18, Math.abs(y2 - y1) / 2);
		return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
	}

	// -----------------------------------------------------------------------
	// Selection
	// -----------------------------------------------------------------------

	function select(id) {
		// The two directions are mutually exclusive: picking a node drops whatever
		// the manuscript selection had lit up.
		selectedByLayer.set(currentLayerId, id);
		activeByLayer.clear();
		applySelection();

		const item = placed.get(id);
		if (item) {
			vscode.postMessage({ type: 'select', id, start: item.start, end: item.end });
		}
	}

	function applySelection() {
		const selectedId = selectedByLayer.get(currentLayerId) ?? null;
		const active = activeByLayer.get(currentLayerId) || new Set();

		for (const group of viewport.querySelectorAll('.node')) {
			group.classList.toggle('selected', group.dataset.id === selectedId);
			group.classList.toggle('active', active.has(group.dataset.id));
		}
		for (const path of viewport.querySelectorAll('.edge')) {
			const incident = path.dataset.from === selectedId || path.dataset.to === selectedId;
			path.classList.toggle('incident', Boolean(selectedId) && incident);
		}
	}

	// -----------------------------------------------------------------------
	// Pan and zoom
	// -----------------------------------------------------------------------

	function applyView() {
		viewport.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
	}

	/** Scale the whole graph to fit, then centre it. */
	function fit() {
		if (placed.size === 0) {
			return;
		}
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const item of placed.values()) {
			minX = Math.min(minX, item.x);
			minY = Math.min(minY, item.y);
			maxX = Math.max(maxX, item.x + item.w);
			maxY = Math.max(maxY, item.y + item.h);
		}

		const margin = 28;
		const box = svg.getBoundingClientRect();
		const k = Math.min(
			2,
			(box.width - margin * 2) / Math.max(1, maxX - minX),
			(box.height - margin * 2) / Math.max(1, maxY - minY)
		);
		view.k = Math.max(0.2, k);
		view.x = box.width / 2 - ((minX + maxX) / 2) * view.k;
		view.y = box.height / 2 - ((minY + maxY) / 2) * view.k;
		applyView();
	}

	svg.addEventListener('wheel', (event) => {
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
	}, { passive: false });

	/** How far the pointer may drift before a press counts as a pan, not a click. */
	const DRAG_THRESHOLD = 4;

	/**
	 * Panning and node selection share one gesture, so both live here.
	 *
	 * They can't be split into "pan on the background, click on a node": calling
	 * setPointerCapture retargets the following `click` to the capture element, so
	 * a click listener on the node never hears about it. Instead we track the press
	 * ourselves and only capture the pointer once it has moved far enough to be a
	 * drag — a press that never moves is a selection.
	 */
	let press = null;

	svg.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) {
			return;
		}
		const group = event.target.closest ? event.target.closest('.node') : null;
		press = {
			pointerId: event.pointerId,
			px: event.clientX,
			py: event.clientY,
			x: view.x,
			y: view.y,
			nodeId: group ? group.dataset.id : null,
			panning: false,
		};
	});

	svg.addEventListener('pointermove', (event) => {
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

	// -----------------------------------------------------------------------
	// Bits and pieces
	// -----------------------------------------------------------------------

	function svgEl(name) {
		return document.createElementNS('http://www.w3.org/2000/svg', name);
	}

	function showStatus(text) {
		status.textContent = text;
		status.hidden = false;
	}

	function hideStatus() {
		status.hidden = true;
	}
})();
