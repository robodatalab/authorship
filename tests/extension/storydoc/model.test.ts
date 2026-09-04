import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    CHAPTER,
    MARKDOWN,
    NOTE,
    AuthorDocument,
    Cell,
} from "../../../extension/vscode_runtime/storydoc/model";

interface Case {
    name: string;
    text: string;
    cells: { kind: string; source: string; attrs: Record<string, string> }[];
    dumped: string;
}

function cellsOfText(text: string): Cell[] {
    return AuthorDocument.fromText(text).cells;
}

function textWrittenBack(text: string): string {
    return AuthorDocument.fromText(text).toText();
}

const CORPUS: { cases: Case[] } = JSON.parse(
    readFileSync(join(__dirname, "../../storydoc_corpus.json"), "utf-8"),
);

describe("the shared corpus — the same documents server/storydoc.py reads", () => {
    // The same file drives the Python tests, so a rule added in one language
    // cannot quietly go unimplemented in the other.
    for (const testCase of CORPUS.cases) {
        it(testCase.name, () => {
            expect(cellsOfText(testCase.text)).toEqual(testCase.cells);
        });
    }

    // Round-tripping through this library alone would let the two implementations
    // drift apart while both stayed self-consistent, so the corpus pins the bytes
    // rather than the behaviour.
    for (const testCase of CORPUS.cases) {
        it(`writes back byte for byte: ${testCase.name}`, () => {
            expect(textWrittenBack(testCase.text)).toBe(testCase.dumped);
        });
    }

    for (const testCase of CORPUS.cases) {
        it(`survives a round trip: ${testCase.name}`, () => {
            const cells = cellsOfText(testCase.text);
            expect(cellsOfText(textWrittenBack(testCase.text))).toEqual(cells);
        });
    }
});

describe("writing a document back out", () => {
    it("writes a cell as a marker and its text", () => {
        expect(textWrittenBack("<!-- cell: markdown -->\n\nProse.\n")).toBe(
            "<!-- cell: markdown -->\n\nProse.\n",
        );
    });

    it("writes a cell with no text as its marker alone", () => {
        expect(textWrittenBack("<!-- cell: contents -->\n")).toBe(
            "<!-- cell: contents -->\n",
        );
    });

    it("writes a kind it has never heard of back as it was read", () => {
        const text = '<!-- cell: epigraph attribution="Anon" -->\n\nA line.\n';
        expect(textWrittenBack(text)).toBe(text);
    });

    it("escapes a quote in an attribute on the way out", () => {
        expect(new Cell(CHAPTER, "", { title: 'She said "no"' }).marker()).toBe(
            '<!-- cell: chapter title="She said \\"no\\"" -->',
        );
    });

    it("writes every attribute a cell carries", () => {
        expect(
            textWrittenBack('<!-- cell: part title="Break" print="no" -->\n'),
        ).toBe('<!-- cell: part title="Break" print="no" -->\n');
    });
});

describe("inserting a cell", () => {
    const blankChapter = () =>
        AuthorDocument.fromText('<!-- cell: chapter title="New" -->\n')
            .cells[0];

    it("puts it at the place it was given", () => {
        const document = AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\n",
        );

        document.insertAt(0, blankChapter());

        expect(document.cells.map((cell) => cell.kind)).toEqual([
            CHAPTER,
            MARKDOWN,
        ]);
    });

    it("puts it after the last cell when the place is the end", () => {
        const document = AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\n",
        );

        document.insertAt(document.cells.length, blankChapter());

        expect(document.cells.map((cell) => cell.kind)).toEqual([
            MARKDOWN,
            CHAPTER,
        ]);
    });

    it("carries the attributes it was given", () => {
        const document = AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\n",
        );

        document.insertAt(0, blankChapter());

        expect(document.cells[0].attrs).toEqual({ title: "New" });
    });

    it("says the document changed", () => {
        const document = AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\n",
        );
        let changes = 0;
        document.onChanged(() => changes++);

        document.insertAt(0, blankChapter());

        expect(changes).toBe(1);
    });

    it("leaves the inserted cell saying so when it is edited", () => {
        const document = AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\n",
        );
        document.insertAt(0, blankChapter());
        let changes = 0;
        document.onChanged(() => changes++);

        document.cells[0].replaceMarkdown("written");

        expect(changes).toBe(1);
    });
});

describe("what a document reads as", () => {
    const readCells = (text: string) =>
        AuthorDocument.fromText(text).cells.map((cell) => ({
            kind: cell.kind,
            source: cell.source,
            attrs: cell.attrs,
        }));

    it("reads nothing out of an empty file", () => {
        expect(readCells("")).toEqual([]);
    });

    it("reads nothing out of a file of blank lines", () => {
        expect(readCells("\n\n\n")).toEqual([]);
    });

    it("reads nothing out of a file with no markers", () => {
        expect(readCells("one\n\ntwo\n")).toEqual([]);
    });

    it("reads a marker with nothing under it as an empty cell", () => {
        expect(readCells("<!-- cell: markdown -->\n")).toEqual([
            { kind: MARKDOWN, source: "", attrs: {} },
        ]);
    });

    it("reads an empty cell written above a written one as its own cell", () => {
        expect(
            readCells(
                "<!-- cell: markdown -->\n\n<!-- cell: markdown -->\n\none\n",
            ),
        ).toEqual([
            { kind: MARKDOWN, source: "", attrs: {} },
            { kind: MARKDOWN, source: "one", attrs: {} },
        ]);
    });

    it("reads a run of empty cells as that many cells", () => {
        expect(
            readCells(
                "<!-- cell: markdown -->\n<!-- cell: note -->\n<!-- cell: markdown -->\n",
            ),
        ).toEqual([
            { kind: MARKDOWN, source: "", attrs: {} },
            { kind: NOTE, source: "", attrs: {} },
            { kind: MARKDOWN, source: "", attrs: {} },
        ]);
    });

    it("reads nothing out of the text written above the first marker", () => {
        expect(
            readCells('loose\n\n<!-- cell: chapter title="One" -->\n\nunder\n'),
        ).toEqual([
            { kind: CHAPTER, source: "under", attrs: { title: "One" } },
        ]);
    });

    it("reads no cell for blank lines above the first marker", () => {
        expect(readCells("\n\n<!-- cell: chapter -->\n")).toEqual([
            { kind: CHAPTER, source: "", attrs: {} },
        ]);
    });

    it("reads every attribute a marker carries", () => {
        expect(
            readCells(
                '<!-- cell: title-page title="A Story" author="Someone" -->\n',
            ),
        ).toEqual([
            {
                kind: "title-page",
                source: "",
                attrs: { title: "A Story", author: "Someone" },
            },
        ]);
    });

    it("reads an escaped quote inside an attribute", () => {
        expect(
            readCells('<!-- cell: chapter title="A \\"Story\\"" -->\n'),
        ).toEqual([
            { kind: CHAPTER, source: "", attrs: { title: 'A "Story"' } },
        ]);
    });

    it("reads a kind it has never heard of as that kind", () => {
        expect(
            readCells("<!-- cell: epigraph -->\n\nWhom the gods…\n"),
        ).toEqual([{ kind: "epigraph", source: "Whom the gods…", attrs: {} }]);
    });

    it("keeps blank lines inside a cell and drops them at its ends", () => {
        expect(
            readCells("<!-- cell: markdown -->\n\n\none\n\ntwo\n\n\n"),
        ).toEqual([{ kind: MARKDOWN, source: "one\n\ntwo", attrs: {} }]);
    });

    it("reads a line that looks like a marker inside a cell as a new cell", () => {
        expect(
            readCells(
                "<!-- cell: markdown -->\n\none\n<!-- cell: note -->\ntwo\n",
            ),
        ).toEqual([
            { kind: MARKDOWN, source: "one", attrs: {} },
            { kind: NOTE, source: "two", attrs: {} },
        ]);
    });
});

describe("moving a cell", () => {
    const threeCells = () =>
        AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\n\n<!-- cell: markdown -->\n\ntwo\n\n<!-- cell: markdown -->\n\nthree\n",
        );

    it("swaps it with the one above", () => {
        const document = threeCells();

        document.moveAt(1, 0);

        expect(document.cells.map((cell) => cell.source)).toEqual([
            "two",
            "one",
            "three",
        ]);
    });

    it("swaps it with the one below", () => {
        const document = threeCells();

        document.moveAt(1, 2);

        expect(document.cells.map((cell) => cell.source)).toEqual([
            "one",
            "three",
            "two",
        ]);
    });

    it("leaves the first cell where it is", () => {
        const document = threeCells();
        let changes = 0;
        document.onChanged(() => changes++);

        document.moveAt(0, -1);

        expect(document.cells.map((cell) => cell.source)).toEqual([
            "one",
            "two",
            "three",
        ]);
        expect(changes).toBe(0);
    });

    it("leaves the last cell where it is", () => {
        const document = threeCells();
        let changes = 0;
        document.onChanged(() => changes++);

        document.moveAt(2, 3);

        expect(document.cells.map((cell) => cell.source)).toEqual([
            "one",
            "two",
            "three",
        ]);
        expect(changes).toBe(0);
    });

    it("says the document changed", () => {
        const document = threeCells();
        let changes = 0;
        document.onChanged(() => changes++);

        document.moveAt(0, 1);

        expect(changes).toBe(1);
    });
});

describe("deleting a cell", () => {
    const twoCells = () =>
        AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\n\n<!-- cell: note -->\n\ntwo\n",
        );

    it("takes it out of the document", () => {
        const document = twoCells();

        document.removeAt(0);

        expect(document.cells.map((cell) => cell.kind)).toEqual([NOTE]);
    });

    it("says the document changed", () => {
        const document = twoCells();
        let changes = 0;
        document.onChanged(() => changes++);

        document.removeAt(1);

        expect(changes).toBe(1);
    });

    it("does nothing when there is no cell there", () => {
        const document = twoCells();
        let changes = 0;
        document.onChanged(() => changes++);

        document.removeAt(2);

        expect(document.cells).toHaveLength(2);
        expect(changes).toBe(0);
    });
});

describe("folding a cell", () => {
    const cellOf = (text: string) => AuthorDocument.fromText(text).cells[0];

    it("is not folded to begin with", () => {
        expect(cellOf("<!-- cell: markdown -->\n\none\n").isFolded()).toBe(
            false,
        );
    });

    it("is folded when the document says so", () => {
        expect(cellOf("<!-- cell: markdown -->\n\none\n").isFolded()).toBe(
            false,
        );
        expect(
            cellOf('<!-- cell: markdown folded="true" -->\n\none\n').isFolded(),
        ).toBe(true);
    });

    it("writes the fold into the document", () => {
        const document = AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\n",
        );

        document.cells[0].fold(true);

        expect(document.toText()).toBe(
            '<!-- cell: markdown folded="true" -->\n\none\n',
        );
    });

    it("takes the attribute out again when it is unfolded", () => {
        const document = AuthorDocument.fromText(
            '<!-- cell: markdown folded="true" -->\n\none\n',
        );

        document.cells[0].fold(false);

        expect(document.toText()).toBe("<!-- cell: markdown -->\n\none\n");
    });

    it("says the document changed", () => {
        const document = AuthorDocument.fromText(
            "<!-- cell: markdown -->\n\none\n",
        );
        let changes = 0;
        document.onChanged(() => changes++);

        document.cells[0].fold(true);

        expect(changes).toBe(1);
    });

    it("says nothing when it is already folded", () => {
        const document = AuthorDocument.fromText(
            '<!-- cell: markdown folded="true" -->\n\none\n',
        );
        let changes = 0;
        document.onChanged(() => changes++);

        document.cells[0].fold(true);

        expect(changes).toBe(0);
    });
});
