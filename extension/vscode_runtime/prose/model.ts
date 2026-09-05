import type { AuthorDocument, Cell } from "../storydoc/model";

/**
 * One thing a check found, and where it is.
 *
 * The cell itself rather than its place in the document: a section the author
 * moves or deletes takes its errors with it, and an index would name whatever
 * cell had moved into its place.
 */
export class AuthorDocumentProseError {
    constructor(
        readonly id: number,
        readonly rule: string,
        readonly kind: string,
        readonly cell: Cell,
        readonly at: number,
        readonly end: number,
        readonly message: string,
        readonly detail: string,
        readonly replacements: string[],
    ) {}

    movedBy(characters: number): AuthorDocumentProseError {
        return new AuthorDocumentProseError(
            this.id,
            this.rule,
            this.kind,
            this.cell,
            this.at + characters,
            this.end + characters,
            this.message,
            this.detail,
            this.replacements,
        );
    }
}

/** What an edit did to a cell's text, in the text as it was before it. */
interface TextChange {
    at: number;
    removed: number;
    inserted: number;
}

/**
 * The one edit that turns one text into the other.
 *
 * Read from both ends, so what is left between them is everything the author
 * touched. Two edits in one keystroke is not a thing a text box does.
 */
function changeBetween(before: string, after: string): TextChange {
    let at = 0;
    while (
        at < before.length &&
        at < after.length &&
        before[at] === after[at]
    ) {
        at++;
    }
    let tail = 0;
    while (
        tail < before.length - at &&
        tail < after.length - at &&
        before[before.length - 1 - tail] === after[after.length - 1 - tail]
    ) {
        tail++;
    }
    return {
        at,
        removed: before.length - at - tail,
        inserted: after.length - at - tail,
    };
}

/**
 * What the checks found in a document, kept in step with what is written.
 *
 * The errors are put here by a pass over the prose, and the prose goes on being
 * written under them. So the check listens to every cell it marked: an error
 * after an edit is still about the same words a few characters along, and one
 * the author typed through is about words that are no longer there and goes.
 */
export class AuthorDocumentProseCheck {
    private errorsFound: AuthorDocumentProseError[] = [];
    private readonly textWhenChecked = new Map<Cell, string>();
    private readonly watched = new Set<Cell>();
    private readonly changeListeners: (() => void)[] = [];

    get errors(): AuthorDocumentProseError[] {
        return this.errorsFound;
    }

    errorsIn(cell: Cell): AuthorDocumentProseError[] {
        return this.errorsFound.filter((error) => error.cell === cell);
    }

    replace(errors: AuthorDocumentProseError[]): void {
        this.errorsFound = [];
        this.add(errors);
    }

    /**
     * What a second pass found, beside what the first did.
     *
     * The rules answer in milliseconds and the model in seconds, so what the
     * rules found is drawn while the model is still reading.
     */
    add(errors: AuthorDocumentProseError[]): void {
        this.errorsFound = [...this.errorsFound, ...errors];
        for (const error of errors) {
            this.textWhenChecked.set(error.cell, error.cell.source);
            this.watch(error.cell);
        }
        this.notifyChanged();
    }

    /**
     * Take one error away, because what it was about has been put right.
     *
     * The edit that fixed it does not always run through it — a full stop put
     * at the end of the marked words touches none of them — so the fix says so
     * itself rather than leaving it to be worked out from the text.
     */
    remove(id: number): void {
        const kept = this.errorsFound.filter((error) => error.id !== id);
        if (kept.length === this.errorsFound.length) {
            return;
        }
        this.errorsFound = kept;
        this.notifyChanged();
    }

    onChanged(listener: () => void): void {
        this.changeListeners.push(listener);
    }

    private watch(cell: Cell): void {
        if (this.watched.has(cell)) {
            return;
        }
        this.watched.add(cell);
        cell.onChanged(() => this.cellChanged(cell));
    }

    private cellChanged(cell: Cell): void {
        const before = this.textWhenChecked.get(cell);
        // Folding a section is not writing in it.
        if (before === undefined || before === cell.source) {
            return;
        }
        this.textWhenChecked.set(cell, cell.source);
        const change = changeBetween(before, cell.source);
        const kept = this.errorsFound.filter(
            (error) => error.cell !== cell || survives(error, change),
        );
        this.errorsFound = kept.map((error) =>
            error.cell === cell ? afterChange(error, change) : error,
        );
        this.notifyChanged();
    }

    private notifyChanged(): void {
        for (const listener of this.changeListeners) {
            listener();
        }
    }
}

/** An error the author has written through is about words that are gone. */
function survives(
    error: AuthorDocumentProseError,
    change: TextChange,
): boolean {
    return error.end <= change.at || error.at >= change.at + change.removed;
}

function afterChange(
    error: AuthorDocumentProseError,
    change: TextChange,
): AuthorDocumentProseError {
    return error.at < change.at
        ? error
        : error.movedBy(change.inserted - change.removed);
}

/** A place in the file, as the cell it is in and how far into its text. */
export interface AuthorDocumentPlace {
    cell: Cell;
    offset: number;
}

/**
 * Where a line and column of the file falls among the cells.
 *
 * The server is given the document as one text and answers about that text, so
 * this walks the layout `toText` writes — a marker, a blank line, the source,
 * a blank line — back to the cell the line was written in. A line that is a
 * marker or the blank under it is in no cell's prose.
 */
export function placeInDocument(
    document: AuthorDocument,
    line: number,
    character: number,
): AuthorDocumentPlace | null {
    let first = 0;
    for (const cell of document.cells) {
        first += 2;
        if (!cell.source) {
            continue;
        }
        const lines = cell.source.split("\n");
        if (line < first) {
            return null;
        }
        if (line < first + lines.length) {
            const before = lines
                .slice(0, line - first)
                .reduce((sum, text) => sum + text.length + 1, 0);
            return { cell, offset: before + character };
        }
        first += lines.length + 1;
    }
    return null;
}

/**
 * Where a place in a cell's text falls in the file, which is how the server is
 * told where to read.
 *
 * The other way round from `placeInDocument`, over the same layout.
 */
export function placeInFile(
    document: AuthorDocument,
    cell: Cell,
    offset: number,
): { line: number; character: number } | null {
    let first = 0;
    for (const written of document.cells) {
        first += 2;
        if (written !== cell) {
            first += written.source ? written.source.split("\n").length + 1 : 0;
            continue;
        }
        const lines = written.source.split("\n");
        let read = 0;
        for (const [line, text] of lines.entries()) {
            if (offset <= read + text.length) {
                return { line: first + line, character: offset - read };
            }
            read += text.length + 1;
        }
        return null;
    }
    return null;
}
