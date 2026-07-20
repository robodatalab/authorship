# RFC: Story graph viewer

A webview beside the manuscript showing its structure as a graph, wired to the editor both
ways: click a node to highlight the prose it covers, move the cursor to light up the nodes
covering it.

## 1. Why a custom format and renderer

Graphviz, Mermaid, D2 and JSON Canvas all have interactive VS Code previews, and all were
rejected for one reason: **a third-party preview cannot hand click events to this extension.**
Mermaid's `click` callback runs inside its own webview. The only channel crossing the
extension boundary is a link the viewer opens, and `vscode://file/path:line` is the most that
can express.

That buys node → jump-to-line and nothing else — no highlight over a range, and no reverse
direction at all, since "where is the cursor" is not expressible as a link. This view is the
navigation workhorse, so that is disqualifying.

## 2. Format

`story_1.md` is accompanied by `story_1.graph.yaml` beside it. By convention, not
configuration: [`graphPathFor`](../src/story_graph/model.ts) replaces the trailing `.md`.

```yaml
layer:
  - id: 1
    nodes:
      - node: 1
        title: knocking at the door
        start: 3
        end: 5
      - node: 2
        title: checking
        start: 5
        end: 11
    edges:
      - edge: 1
        start: 1
        end: 2
```

| field | on a node | on an edge |
|---|---|---|
| `node` / `edge` | its id | its id |
| `start` | first manuscript line, 1-based, inclusive | source node id |
| `end` | last manuscript line, 1-based, inclusive | target node id |
| `title` | label drawn in the box | — |

`start`/`end` mean different things in the two sections. The parser renames edge endpoints to
`from`/`to` so the ambiguity stops at the file boundary.

**Node ids are unique only within a layer** — node `1` is "knocking at the door" in layer 1
and "introduction" in layer 2. Nothing keyed by node id may be shared between layers.

**Also accepted:** `layer` or `layers`; a list or a single mapping (the original one-layer
shape still opens); `node`/`id` and `edge`/`id`; `start`/`end` or `from`/`to` on edges. A
layer without an `id` takes its 1-based position.

**Silently dropped:** nodes with no id or unusable line numbers, edges naming a node that does
not exist, layers left with no nodes. The file is machine-written by
[story_graph_builder.md](story_graph_builder.md) and may be read mid-rewrite, so a partial
file renders whatever part of itself is valid.

`layer:` is a list ordered by convention — the lower the id, the finer the grain. Nothing in
the code reads that ordering (see §4). A widget top-left switches between layers, hidden below
two. The current layer survives graph-file reloads, so a background rewrite does not yank the
view back to layer one.

## 3. Architecture

**Host** — [`panel.ts`](../src/story_graph/panel.ts). One `StoryGraphPanel` per document,
keyed by URI, so re-running the command brings the existing panel forward. Owns the file
watcher, the YAML read and the editor decoration. Opens in `ViewColumn.Beside`.

**View** — [`view.ts`](../src/story_graph/view.ts), bundled by a second webpack entry to
`dist/story_graph_view.js`. DOM only: SVG construction, pan/zoom, messaging.

The decisions live in two modules free of both `vscode` and the DOM, imported by either side:
[`model.ts`](../src/story_graph/model.ts) — parsing, the overlap rule, span merging — and
[`view_state.ts`](../src/story_graph/view_state.ts) — layers and selection. That split is what
makes the behaviour testable without launching an editor (§5).

`media/graph.css` stays a static asset loaded by URI; bundling it would force
`style-src 'unsafe-inline'` or a nonce.

| direction | message | meaning |
|---|---|---|
| host → view | `{type: 'graph', layers}` | freshly read file |
| host → view | `{type: 'active', active, keepSelection}` | editor selection moved |
| host → view | `{type: 'error', message}` | file unreadable |
| view → host | `{type: 'select', ranges}` | highlight these lines |

`active` carries every layer's matches at once, so switching layers needs no round trip.

## 4. Selection

The only relationship between graph and manuscript is line-span overlap, with exactly one
implementation — [`spansOverlap`](../src/story_graph/model.ts) — called by both directions. A
shared boundary line counts, since nodes routinely end where the next begins.

**Graph → manuscript.** Clicking a node posts its lines; the host reveals them and paints a
`rangeHighlightBackground` decoration with `preserveFocus`, so focus stays in the graph.

**Manuscript → graph.** `onDidChangeTextEditorSelection` matches against every layer. A bare
cursor is an empty selection, so cursor and dragged range take the same path, and a line
inside several nodes lights up all of them. Multi-cursor unions. Clicked nodes render solid,
cursor-derived ones dashed — dashed rather than a second colour, so the distinction survives
several lighting up at once.

**Near-statelessness.** The view remembers one thing: the **anchor**, the lines the user
actually picked. Every layer's selection is derived from it afresh, never from what the
previous layer resolved to — deriving from the previous result reset the range to the wider
node just landed on, so the selection crept outward on every switch.

Carrying is one operation in both directions, which is why layer numbering is never read: a
fine node's lines fall inside one broad node or straddle two; a broad node's lines cover
several narrow ones and all come along. Round trips are idempotent but not identity — going
coarse and back can return more nodes than you started with, when the anchor overlaps
neighbours sharing a boundary line.

**Mutual exclusivity.** Clicking a node clears the cursor-derived highlights; moving the
cursor clears the clicked node and the editor decoration. One exemption: a background rewrite
re-sends the cursor's matches with `keepSelection`, since that is not the user picking a side.

Two consequences worth knowing:

- **Clicking a node does not move the text cursor.** This keeps the directions from feeding
  back into each other, but the editor then shows two things at once — our decoration, and VS
  Code's own current-line highlight wherever the cursor was left. They look nearly identical,
  and the second is routinely mistaken for a stale highlight of ours.
- **Overlapping spans are merged before decorating.** Two ranges sharing a line stack their
  translucent backgrounds, and the shared line reads as a second, stronger selection.

## 5. Layout, gestures, tests

**Layout** ([`view_layout.ts`](../src/story_graph/view_layout.ts)) is layered top-to-bottom.
Depth is the longest path to a node, relaxed until stable and capped at the node count, which
both terminates and stops a cycle spinning. Within a row, nodes are ordered by manuscript
position, so the picture is stable across reloads. No layout library — a vertical
Sugiyama-style pass over a few dozen nodes is a hundred lines.

**Gestures.** Pan and selection share one handler. They cannot be split into "pan on the
background, click on a node": `setPointerCapture` retargets the following `click` to the
capture element, so a listener on the node never fires — nodes rendered and panned correctly
while clicking did nothing. Instead the press is tracked directly, becoming a pan only past
4px of movement; a press that never moves is a selection.

**Tests.** `npm test` — vitest, no VS Code instance. 79 tests over the three pure modules:
parsing and its tolerances; both selection directions, mutual exclusivity and the cross-layer
carry; depths, placement, wrapping and edge paths. `panel.ts` and `view.ts` are untested —
they would need a stubbed `vscode` and a DOM environment respectively, and the logic worth
testing was moved out of them first. CI runs the suite on pull requests targeting `main`.

## 6. Extending it

**A new node field** — add it in `normalizeLayer`; it reaches the view unchanged.

**A new visual state** — `view_state.ts` decides, `view.ts` toggles a class, `graph.css`
styles it. Keep the decision out of the DOM file.

**A different relationship than line overlap** — replace `spansOverlap`. One implementation,
both directions call it.

**Node granularity** — undecided. A node is whatever the builder emits; nothing here assumes
scene, beat or chapter.

**Nesting rather than switching** — layers are flat and independent, related only by overlap.
Saying a coarse node *contains* particular fine nodes needs an explicit reference in the
schema, turning the carry from a computation into a lookup.

---

How the graph file gets written: [story_graph_builder.md](story_graph_builder.md).
