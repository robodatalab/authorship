// Which manuscripts the model is reading right now.
//
// The status bar and the graph view both need to know, and a build is minutes
// long, so "is anything happening" is a question asked from two places at once.
// Keeping the answer here rather than inside the builder is what lets the graph
// view show a rebuild without knowing anything about HTTP.
//
// Free of the `vscode` module — and of the DOM — so it can be asserted directly,
// and so the webview bundle can import the formatting below.

/**
 * A build in flight.
 *
 * `startedAt` is wall clock rather than elapsed time: a panel opened halfway
 * through a rebuild has to be able to say how long it has already been going,
 * and it cannot do that from a duration it never saw the start of.
 */
export interface Build {
	path: string;
	startedAt: number;
}

/** Called with the path whose build state changed, and what it changed to. */
export type BuildListener = (path: string, build: Build | undefined) => void;

export class BuildActivity {
	private readonly builds = new Map<string, Build>();
	private readonly listeners = new Set<BuildListener>();

	/**
	 * Announce a build, displacing whatever was reading the same manuscript.
	 *
	 * The returned handle is what `finished` takes, so a build that has already
	 * been superseded cannot retire the one that replaced it — which is exactly
	 * what happens when the older build's request finally unwinds.
	 */
	started(path: string, at: number): Build {
		const build: Build = { path, startedAt: at };
		this.builds.set(path, build);
		this.announce(path, build);
		return build;
	}

	/** Retire a build, unless a newer one has already taken the file over. */
	finished(build: Build): void {
		if (this.builds.get(build.path) !== build) {
			return;
		}
		this.builds.delete(build.path);
		this.announce(build.path, undefined);
	}

	get(path: string): Build | undefined {
		return this.builds.get(path);
	}

	/** Whether anything at all is building — what the status bar reports. */
	any(): boolean {
		return this.builds.size > 0;
	}

	/** Returns the way to stop listening; panels come and go. */
	onChange(listener: BuildListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private announce(path: string, build: Build | undefined): void {
		for (const listener of [...this.listeners]) {
			listener(path, build);
		}
	}
}

/**
 * How long a build has been running, as it reads on screen.
 *
 * Rounded to the second and counting up: the point is not precision but a number
 * that visibly changes, since a slow rebuild and a wedged one look identical
 * otherwise.
 */
export function elapsedSince(startedAt: number, now: number): string {
	const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}
