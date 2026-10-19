import { describe, expect, it } from "vitest";

import {
    fromMarkdown,
    toMarkdown,
} from "../../../extension/vscode_runtime/markdown/exporter";
import {
    Cell,
    Document,
} from "../../../extension/vscode_runtime/storydoc/storydoc";

function cellsOf(text: string): Cell[] {
    return new Document(text).cells;
}

function markdownOf(text: string): string {
    return toMarkdown(cellsOf(text));
}

function withoutIds(authorText: string): string {
    return authorText.replace(/ id="[^"]*"/g, "");
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

    it("writes nothing for a salient concept", () => {
        expect(
            markdownOf(
                '<!-- cell: salient-concept title="Michael" -->\n\nSarah\'s husband.\n',
            ),
        ).toBe("");
    });

    it("writes the author's links under the heading, above what they wrote", () => {
        expect(
            markdownOf(
                '<!-- cell: about kdp="https://amazon.com/author/p" -->\n\nI write.\n',
            ),
        ).toBe(
            "### About the Author\n\n[Books on Amazon](https://amazon.com/author/p)\n\nI write.\n",
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

    it("writes an image as the picture it points at", () => {
        expect(markdownOf('<!-- cell: image src="art/cover.jpg" -->\n')).toBe(
            "![](art/cover.jpg)\n",
        );
    });

    it("writes nothing for an image nobody has pointed anywhere", () => {
        expect(markdownOf("<!-- cell: image -->\n")).toBe("");
    });

    it("writes nothing at all for a document with no cells", () => {
        expect(markdownOf("")).toBe("");
    });
});

describe("what a markdown manuscript imports as", () => {
    it("reads a first-level heading as the title page", () => {
        expect(withoutIds(fromMarkdown("# Veriona\n"))).toBe(
            '<!-- cell: title-page title="Veriona" -->\n',
        );
    });

    it("reads the three levels as title page, part and chapter", () => {
        expect(
            withoutIds(fromMarkdown("# Veriona\n\n## Book One\n\n### Night\n")),
        ).toBe(
            '<!-- cell: title-page title="Veriona" -->\n\n<!-- cell: part title="Book One" -->\n\n<!-- cell: chapter title="Night" -->\n',
        );
    });

    it("reads the prose under a heading as a markdown cell of its own", () => {
        expect(withoutIds(fromMarkdown("### Night\n\nIt began badly.\n"))).toBe(
            '<!-- cell: chapter title="Night" -->\n\n<!-- cell: markdown -->\n\nIt began badly.\n',
        );
    });

    it("reads prose written before any heading", () => {
        expect(withoutIds(fromMarkdown("Loose.\n\n### Night\n"))).toBe(
            '<!-- cell: markdown -->\n\nLoose.\n\n<!-- cell: chapter title="Night" -->\n',
        );
    });

    it("reads a deeper heading as prose, since the story has three levels", () => {
        expect(withoutIds(fromMarkdown("#### Deeper\n"))).toBe(
            "<!-- cell: markdown -->\n\n#### Deeper\n",
        );
    });

    it("reads nothing out of an empty manuscript", () => {
        expect(fromMarkdown("")).toBe("");
    });
});

describe("a manuscript that goes out and comes back", () => {
    it("keeps the story's levels and its prose", () => {
        const authorText =
            '<!-- cell: part title="Book One" -->\n\n<!-- cell: chapter title="Night" -->\n\n<!-- cell: markdown -->\n\nIt began badly.\n';

        const cameBack = fromMarkdown(markdownOf(authorText));

        expect(withoutIds(cameBack)).toBe(authorText);
    });
});
