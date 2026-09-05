import { describe, expect, it } from "vitest";

import {
    fromMarkdown,
    toMarkdown,
} from "../../../extension/vscode_runtime/markdown/exporter";
import {
    AuthorDocument,
    Cell,
} from "../../../extension/vscode_runtime/storydoc/model";

function cellsOf(text: string): Cell[] {
    return AuthorDocument.fromText(text).cells;
}

function markdownOf(text: string): string {
    return toMarkdown(cellsOf(text));
}

function shapeOf(
    authorText: string,
): { kind: string; source: string; attrs: Record<string, string> }[] {
    return cellsOf(authorText).map((cell) => {
        const { id: _id, ...attrs } = cell.attrs;
        return { kind: cell.kind, source: cell.source, attrs };
    });
}

describe("what a document exports as", () => {
    it("writes a markdown cell as its prose", () => {
        expect(markdownOf("<!-- cell: markdown -->\n\nIt began badly.\n")).toBe(
            "It began badly.\n",
        );
    });

    it("writes a part as a second-level heading and a chapter as a third", () => {
        expect(
            markdownOf(
                '<!-- cell: part title="Book One" -->\n\n<!-- cell: chapter title="The First Night" -->\n',
            ),
        ).toBe("## Book One\n\n### The First Night\n");
    });

    it("writes the title page as the name of the book and its credits", () => {
        expect(
            markdownOf(
                '<!-- cell: title-page title="Veriona" subtitle="A drama" author="Pierre" date="2026-08-17" -->\n',
            ),
        ).toBe("# Veriona\n\n*A drama*\n\nPierre · 2026-08-17\n");
    });

    it("writes a note as a comment no reader of the book sees", () => {
        expect(
            markdownOf(
                "<!-- cell: note -->\n\n<!--\nRemember the lantern.\n-->\n",
            ),
        ).toBe("<!--\n<!--\nRemember the lantern.\n--&gt;\n-->\n");
    });

    it("writes nothing for the sections that are not in the book", () => {
        expect(
            markdownOf(
                "<!-- cell: blurb -->\n\nBuy it.\n\n<!-- cell: recap -->\n\nLast time.\n",
            ),
        ).toBe("");
    });

    it("writes the author's links after what they wrote about themselves", () => {
        expect(
            markdownOf(
                '<!-- cell: about kdp="https://amazon.com/author/p" -->\n\nI write.\n',
            ),
        ).toBe(
            "### About the Author\n\nI write.\n\n[Books on Amazon](https://amazon.com/author/p)\n",
        );
    });

    it("writes nothing for an about with nothing in it", () => {
        expect(markdownOf("<!-- cell: about -->\n")).toBe("");
    });

    it("heads any other named page as a chapter is headed", () => {
        expect(
            markdownOf(
                '<!-- cell: disclaimer title="Disclaimer" -->\n\nFiction.\n',
            ),
        ).toBe("### Disclaimer\n\nFiction.\n");
    });

    it("writes nothing at all for a document with no cells", () => {
        expect(markdownOf("")).toBe("");
    });
});

describe("what a markdown manuscript imports as", () => {
    it("reads a first-level heading as the title page", () => {
        expect(shapeOf(fromMarkdown("# Veriona\n"))).toEqual([
            { kind: "title-page", source: "", attrs: { title: "Veriona" } },
        ]);
    });

    it("reads the three levels as title page, part and chapter", () => {
        expect(
            shapeOf(
                fromMarkdown("# Veriona\n\n## Book One\n\n### Night\n"),
            ).map((cell) => cell.kind),
        ).toEqual(["title-page", "part", "chapter"]);
    });

    it("reads the prose under a heading as a markdown cell of its own", () => {
        expect(shapeOf(fromMarkdown("### Night\n\nIt began badly.\n"))).toEqual(
            [
                { kind: "chapter", source: "", attrs: { title: "Night" } },
                { kind: "markdown", source: "It began badly.", attrs: {} },
            ],
        );
    });

    it("reads prose written before any heading", () => {
        expect(shapeOf(fromMarkdown("Loose.\n\n### Night\n"))).toEqual([
            { kind: "markdown", source: "Loose.", attrs: {} },
            { kind: "chapter", source: "", attrs: { title: "Night" } },
        ]);
    });

    it("reads a deeper heading as prose, since the story has three levels", () => {
        expect(shapeOf(fromMarkdown("#### Deeper\n"))).toEqual([
            { kind: "markdown", source: "#### Deeper", attrs: {} },
        ]);
    });

    it("reads nothing out of an empty manuscript", () => {
        expect(fromMarkdown("")).toBe("");
    });
});

describe("a manuscript that goes out and comes back", () => {
    it("keeps the story's levels and its prose", () => {
        const text =
            '<!-- cell: part title="Book One" -->\n\n<!-- cell: chapter title="Night" -->\n\n<!-- cell: markdown -->\n\nIt began badly.\n';

        const back = fromMarkdown(markdownOf(text));

        expect(shapeOf(back)).toEqual([
            { kind: "part", source: "", attrs: { title: "Book One" } },
            { kind: "chapter", source: "", attrs: { title: "Night" } },
            { kind: "markdown", source: "It began badly.", attrs: {} },
        ]);
    });
});
