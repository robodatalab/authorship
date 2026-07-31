// Who is allowed to light up lines of the manuscript, and on which layer.
//
// Several features want to draw the reader's eye at a span of prose, and left to
// themselves they each make a decoration type and paint over one another. Two
// sets of lit lines then mean two different things with nothing to tell them
// apart, and whichever feature clears first takes the other's marks with it.
//
// So claims are held here instead, one claimant per layer, and the orchestrator
// paints what this says. Deliberately free of the `vscode` module: what a claim
// displaces is a rule, and rules are worth reading without an editor open.

/**
 * What a highlight is saying.
 *
 * `findings` is a set a tool turned up — every passage a search answered with.
 * It stays until the tool that made it takes it back.
 *
 * `focus` is the one span the reader was just sent to. It stays until they move
 * away from it. A findings claim and a focus claim describe the same lines from
 * different distances, so they coexist; two claims on the same layer do not.
 */
export type Layer = 'findings' | 'focus';

export const LAYERS: readonly Layer[] = ['findings', 'focus'];

/** Lines of a document, 0-based and inclusive at both ends. */
export interface Span {
	start: number;
	end: number;
}

export interface Claim {
	/** Which feature this belongs to, so it can take back its own and no more. */
	source: string;
	/** The document the lines are in, as an opaque key. */
	document: string;
	spans: Span[];
}

/**
 * The claims in force, a layer at a time.
 *
 * A claim displaces whatever held its layer, whoever made it — the newest
 * request is what the reader just asked for. Releasing only takes back a layer
 * the releaser still holds, so a feature tidying up after itself cannot wipe a
 * highlight some other feature made in the meantime.
 */
export class Claims {
	private readonly held = new Map<Layer, Claim>();

	claim(source: string, layer: Layer, document: string, spans: readonly Span[]): void {
		if (spans.length === 0) {
			this.release(source, layer);
			return;
		}
		this.held.set(layer, { source, document, spans: [...spans] });
	}

	/** Take back what this source holds — one layer of it, or all of them. */
	release(source: string, layer?: Layer): void {
		for (const candidate of layer ? [layer] : LAYERS) {
			if (this.held.get(candidate)?.source === source) {
				this.held.delete(candidate);
			}
		}
	}

	/** Drop everything on a layer, whoever holds it. */
	clear(layer: Layer): void {
		this.held.delete(layer);
	}

	on(layer: Layer): Claim | undefined {
		return this.held.get(layer);
	}

	/** What to draw in a given document on a given layer. */
	spansIn(layer: Layer, document: string): Span[] {
		const claim = this.held.get(layer);
		return claim && claim.document === document ? claim.spans : [];
	}
}

/** Whether a line falls inside any of the spans — what keeps a focus alive. */
export function covers(spans: readonly Span[], line: number): boolean {
	return spans.some((span) => span.start <= line && line <= span.end);
}
