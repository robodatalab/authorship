/**
 * A story and the layout it is published in, in one human-readable file.
 *
 * The file is `<name>.author`, and it is markdown. What makes it a story document
 * is that the markdown is cut into cells, each opened by a marker that says what
 * the cell *is*:
 *
 *     <!-- cell: chapter title="The First Night" -->
 *
 *     The lantern had gone out again.
 *
 *     <!-- cell: image src="art/cover.jpg" full-page="yes" -->
 *
 * The marker is an HTML comment, so every reader that renders markdown renders the
 * document and shows none of the scaffolding, and every editor that opens text can
 * edit it. There is no custom editor a person is obliged to use — which is the
 * whole point of not being a notebook full of escaped JSON strings.
 *
 * Two properties are load-bearing:
 *
 * **The format is open.** A cell's type is any name, and this module knows nothing
 * about most of them. An unrecognised type is carried through parse and save
 * untouched, so a document written by a newer version — or by hand — survives a
 * round trip through an older one rather than losing the cells it could not name.
 *
 * **Plain markdown is already a story document.** A file with no markers at all
 * parses as one `markdown` cell holding the lot. Nothing has to be converted, and a
 * document whose markers are all deleted is still the story.
 *
 * The one ambiguity worth naming: a line inside a cell that itself looks like a
 * marker opens a new cell. Markdown has the same bargain with fences.
 */

import { Cell, splitlines } from "./cells/cell";
import { PlotCell } from "./cells/plot_cell";
import { SalientConceptCell } from "./cells/salient_concept_cell";
import { TitlePageCell } from "./cells/title_page_cell";
import { markerFor, parse } from "./parser";
import { MarkerAttributes } from "./visitors/marker_attributes";

export const EXTENSION = ".author";

/** An .author document */
export class Document {
    cells: Cell[];

    constructor(
        text: string,
        readonly path: string | null = null,
    ) {
        this.cells = parse(text);
    }

    static fromCells(
        cells: readonly Cell[],
        path: string | null = null,
    ): Document {
        const written = new Document("", path);
        written.cells = [...cells];
        const text = written.text;
        return new Document(text, path);
    }

    /** The document as text, such that `parse(text) == cells`. */

    get text(): string {
        const markerAttributes = new MarkerAttributes();
        const out: string[] = [];
        for (const cell of this.cells) {
            const marker = markerFor(cell, markerAttributes);
            out.push(marker);
            out.push("");
            if (cell.source) {
                out.push(cell.source);
                out.push("");
            }
        }
        return out.join("\n");
    }

    get lines(): string[] {
        return splitlines(this.text);
    }

    /** What the book says of itself, blank in a document that says nothing. */

    get titlePage(): TitlePageCell {
        return (
            this.cells.find((cell) => cell instanceof TitlePageCell) ??
            new TitlePageCell()
        );
    }

    get title(): string {
        return this.titlePage.title || "Anonymous";
    }

    cellWithId(cellId: string): Cell | undefined {
        return this.cells.find((cell) => cell.uniqueId === cellId);
    }

    salientConcepts(): SalientConceptCell[] {
        return this.cells.filter((cell) => cell instanceof SalientConceptCell);
    }

    plots(): PlotCell[] {
        return this.cells.filter((cell) => cell instanceof PlotCell);
    }

    toString(): string {
        return this.text;
    }

    /** The cell `line` falls in. */

    cellAt(line: number): Cell | null {
        for (const cell of this.cells) {
            if (cell.at && cell.at[0] <= line && line <= cell.at[1]) {
                return cell;
            }
        }
        return null;
    }
}
