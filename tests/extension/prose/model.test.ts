import { describe, expect, it } from "vitest";

import {
    AuthorDocumentProseCheck,
    AuthorDocumentProseError,
    placeInDocument,
} from "../../../extension/vscode_runtime/prose/model";
import { AuthorDocument } from "../../../extension/vscode_runtime/storydoc/model";
import {
    Cell,
    MARKDOWN,
} from "../../../extension/vscode_runtime/storydoc/model";

function cellOf(source: string): Cell {
    return new Cell(MARKDOWN, source, {});
}

function errorIn(
    cell: Cell,
    at: number,
    end: number,
): AuthorDocumentProseError {
    return new AuthorDocumentProseError(
        1,
        "repetition",
        cell,
        at,
        end,
        "Repeated word",
        "“very very” says it twice.",
        ["very"],
    );
}

function spanOf(check: AuthorDocumentProseCheck): [number, number][] {
    return check.errors.map((error) => [error.at, error.end]);
}

describe("what a check holds", () => {
    it("holds what the pass found", () => {
        const cell = cellOf("It was very very late.");
        const check = new AuthorDocumentProseCheck();

        check.replace([errorIn(cell, 10, 19)]);

        expect(spanOf(check)).toEqual([[10, 19]]);
    });

    it("says which of them are in a given cell", () => {
        const first = cellOf("It was very very late.");
        const second = cellOf("She said said nothing.");
        const check = new AuthorDocumentProseCheck();

        check.replace([errorIn(first, 10, 19), errorIn(second, 9, 18)]);

        expect(check.errorsIn(second).map((error) => error.at)).toEqual([9]);
    });

    it("puts the last pass in place of the one before it", () => {
        const cell = cellOf("It was very very late.");
        const check = new AuthorDocumentProseCheck();

        check.replace([errorIn(cell, 10, 19)]);
        check.replace([errorIn(cell, 0, 2)]);

        expect(spanOf(check)).toEqual([[0, 2]]);
    });

    it("keeps what the first pass found when the second lands", () => {
        const cell = cellOf("It was very very late.");
        const check = new AuthorDocumentProseCheck();

        check.replace([errorIn(cell, 10, 19)]);
        check.add([errorIn(cell, 0, 2)]);

        expect(spanOf(check)).toEqual([
            [10, 19],
            [0, 2],
        ]);
    });

    it("says so when a pass lands", () => {
        const check = new AuthorDocumentProseCheck();
        let changes = 0;
        check.onChanged(() => changes++);

        check.replace([errorIn(cellOf("one"), 0, 3)]);

        expect(changes).toBe(1);
    });
});

describe("writing under an error", () => {
    const checkedCell = (source: string, at: number, end: number) => {
        const cell = cellOf(source);
        const check = new AuthorDocumentProseCheck();
        check.replace([errorIn(cell, at, end)]);
        return { cell, check };
    };

    it("moves it along when something is written before it", () => {
        const { cell, check } = checkedCell("It was very very late.", 10, 19);

        cell.replaceMarkdown("Truly, it was very very late.");

        expect(spanOf(check)).toEqual([[17, 26]]);
    });

    it("moves it back when something before it is taken out", () => {
        const { cell, check } = checkedCell("It was very very late.", 10, 19);

        cell.replaceMarkdown("Was very very late.");

        expect(spanOf(check)).toEqual([[7, 16]]);
    });

    it("leaves it where it is when the writing is after it", () => {
        const { cell, check } = checkedCell("It was very very late.", 10, 19);

        cell.replaceMarkdown("It was very very late. She waited.");

        expect(spanOf(check)).toEqual([[10, 19]]);
    });

    it("takes it away when the author writes through it", () => {
        const { cell, check } = checkedCell("It was very very late.", 10, 19);

        cell.replaceMarkdown("It was very late.");

        expect(check.errors).toEqual([]);
    });

    it("says so when an edit moved it", () => {
        const { cell, check } = checkedCell("It was very very late.", 10, 19);
        let changes = 0;
        check.onChanged(() => changes++);

        cell.replaceMarkdown("Truly, it was very very late.");

        expect(changes).toBe(1);
    });

    it("leaves the errors of every other cell alone", () => {
        const first = cellOf("It was very very late.");
        const second = cellOf("She said said nothing.");
        const check = new AuthorDocumentProseCheck();
        check.replace([errorIn(first, 10, 19), errorIn(second, 9, 18)]);

        first.replaceMarkdown("Truly, it was very very late.");

        expect(spanOf(check)).toEqual([
            [17, 26],
            [9, 18],
        ]);
    });

    it("is untouched by folding the section away", () => {
        const { cell, check } = checkedCell("It was very very late.", 10, 19);
        let changes = 0;
        check.onChanged(() => changes++);

        cell.fold(true);

        expect(spanOf(check)).toEqual([[10, 19]]);
        expect(changes).toBe(0);
    });
});

describe("where the server says a fault is", () => {
    const document = () =>
        AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\ntwo\n\n<!-- cell: note -->\n\nthree\n",
        );

    const placed = (line: number, character: number) => {
        const found = placeInDocument(document(), line, character);
        return found === null ? null : [found.cell.kind, found.offset];
    };

    it("reads the first line of a cell", () => {
        expect(placed(2, 0)).toEqual(["markdown", 0]);
    });

    it("counts the lines above it inside the same cell", () => {
        expect(placed(3, 1)).toEqual(["markdown", 5]);
    });

    it("reads a line of the cell after it", () => {
        expect(placed(7, 2)).toEqual(["note", 2]);
    });

    it("says nothing for the marker line", () => {
        expect(placed(0, 0)).toBeNull();
    });

    it("says nothing for the blank line under a marker", () => {
        expect(placed(6, 0)).toBeNull();
    });

    it("says nothing for a line past the end of the document", () => {
        expect(placed(20, 0)).toBeNull();
    });

    it("steps over a cell that has no text in it", () => {
        const cells = AuthorDocument.fromText(
            "<!-- cell: contents -->\n\n<!-- cell: markdown -->\n\nwritten\n",
        );
        const found = placeInDocument(cells, 4, 3);
        expect([found?.cell.kind, found?.offset]).toEqual(["markdown", 3]);
    });
});
