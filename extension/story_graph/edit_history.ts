// Undo/redo for graph edits, as a stack of whole-graph snapshots.
//
// Every edit persists a complete layer set, so history need not know what an
// edit *was* — it keeps the states themselves. `commit` records a state an edit
// just produced, making the one before it an undo point.
//
// The subtlety is telling our own writes from a change made underneath us. Each
// write is recorded as pending; the file watcher echoes it back as a reload, and
// `sync` matches the echo against the pending writes — a match is our own save
// (however delayed or coalesced) and leaves history alone, while a reload that
// matches nothing pending was written elsewhere (a rebuild, a hand-edit) and
// clears the history it has invalidated. Matching pending rather than just the
// last state is what keeps a burst of undos from tripping over its own echoes.
//
// Pure and DOM-free, so it can be tested directly; the view wires it to the
// keyboard, the writer and the renderer.

import { sameGraph, type Layer } from './model';

export class EditHistory {
	/** The state currently on disk, as we understand it. */
	private committed: Layer[] | null = null;
	private undoStack: Layer[][] = [];
	private redoStack: Layer[][] = [];
	/** States we have written and still await the watcher to echo back. */
	private pending: Layer[][] = [];

	/**
	 * Record a state produced by an edit. If it differs from the last committed
	 * one, that previous state becomes an undo point and the redo branch is cut.
	 */
	commit(state: readonly Layer[]): void {
		if (this.committed !== null && !sameGraph(this.committed, state)) {
			this.undoStack.push(this.committed);
			this.redoStack = [];
		}
		this.committed = clone(state);
		this.pending.push(clone(state));
	}

	/**
	 * Reconcile with a state that arrived from disk. If it echoes a write of ours
	 * still pending, it is our own save landing and history is untouched; that
	 * write and any older ones it supersedes are cleared from the pending list.
	 * Otherwise it was written underneath us, and the history it invalidated —
	 * along with any outstanding writes — is dropped.
	 */
	sync(state: readonly Layer[]): void {
		const echoed = this.pending.findIndex((written) => sameGraph(written, state));
		if (echoed >= 0) {
			this.pending.splice(0, echoed + 1);
			return;
		}
		this.undoStack = [];
		this.redoStack = [];
		this.pending = [];
		this.committed = clone(state);
	}

	/** Step back, returning the state to apply, or null if there is nothing to undo. */
	undo(): Layer[] | null {
		const previous = this.undoStack.pop();
		if (previous === undefined) {
			return null;
		}
		if (this.committed !== null) {
			this.redoStack.push(this.committed);
		}
		this.committed = previous;
		this.pending.push(clone(previous));
		return clone(previous);
	}

	/** Step forward, returning the state to apply, or null if there is nothing to redo. */
	redo(): Layer[] | null {
		const next = this.redoStack.pop();
		if (next === undefined) {
			return null;
		}
		if (this.committed !== null) {
			this.undoStack.push(this.committed);
		}
		this.committed = next;
		this.pending.push(clone(next));
		return clone(next);
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}
}

/** A deep copy, so a snapshot on the stack can't be mutated by later edits. The
 *  layers are plain data, so a JSON round trip is enough — and it drops the
 *  undefined fields the reader leaves behind, which is harmless. */
function clone(layers: readonly Layer[]): Layer[] {
	return JSON.parse(JSON.stringify(layers)) as Layer[];
}
