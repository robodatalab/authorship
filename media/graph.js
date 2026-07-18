// Story graph renderer.
//
// Runs inside the webview, so this is plain browser JS with no imports — it is
// loaded directly by a <script> tag rather than bundled. The extension host
// sends a normalized {nodes, edges} graph; everything below is layout, drawing
// and the pan/zoom/click handling on top of it.

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

	/** Current pan/zoom, applied as a transform on the viewport group. */
	let view = { k: 1, x: 0, y: 0 };
	let selectedId = null;
	let graph = { nodes: [], edges: [] };
	let placed = new Map();

	window.addEventListener('message', (event) => {
		const message = event.data;
		if (message.type === 'graph') {
			render(message.graph);
		} else if (message.type === 'error') {
			showStatus(message.message);
		}
	});

	// -----------------------------------------------------------------------
	// Layout
	// -----------------------------------------------------------------------

	/**
	 * Layered top-to-bottom layout: an edge always points downward, so depth is
	 * the longest path to a node. Within a layer, nodes are ordered by where they
	 * appear in the manuscript, which keeps the picture stable across reloads and
	 * roughly matches reading order.
	 */
	function layout(g) {
		const byId = new Map();
		for (const node of g.nodes) {
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
			for (const edge of g.edges) {
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

	function render(next) {
		graph = next;
		placed = layout(graph);

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
		for (const edge of graph.edges) {
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

		group.addEventListener('click', () => select(item.id));
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
		selectedId = id;
		applySelection();

		const item = placed.get(id);
		if (item) {
			vscode.postMessage({ type: 'select', id, start: item.start, end: item.end });
		}
	}

	function applySelection() {
		for (const group of viewport.querySelectorAll('.node')) {
			group.classList.toggle('selected', group.dataset.id === selectedId);
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

	let panning = null;

	svg.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) {
			return;
		}
		panning = { px: event.clientX, py: event.clientY, x: view.x, y: view.y };
		svg.setPointerCapture(event.pointerId);
		svg.classList.add('panning');
	});

	svg.addEventListener('pointermove', (event) => {
		if (!panning) {
			return;
		}
		view.x = panning.x + (event.clientX - panning.px);
		view.y = panning.y + (event.clientY - panning.py);
		applyView();
	});

	function endPan(event) {
		if (!panning) {
			return;
		}
		panning = null;
		svg.releasePointerCapture(event.pointerId);
		svg.classList.remove('panning');
	}

	svg.addEventListener('pointerup', endPan);
	svg.addEventListener('pointercancel', endPan);

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
