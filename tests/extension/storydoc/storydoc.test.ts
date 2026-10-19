import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    Document,
    dumps,
    parse,
} from "../../../extension/vscode_runtime/storydoc/storydoc";

interface CorpusCase {
    name: string;
    text: string;
    cells: { kind: string; source: string; id: string }[];
    dumped: string;
}

const CORPUS: { cases: CorpusCase[] } = JSON.parse(
    readFileSync(join(__dirname, "../../storydoc_corpus.json"), "utf-8"),
);

describe("the shared corpus — the same documents server/storydoc.py reads", () => {
    it.each(CORPUS.cases)("reads $name", ({ text, cells }) => {
        const parsed = parse(text).map((cell) => ({
            kind: cell.kind,
            source: cell.source,
            id: cell.uniqueId,
        }));

        expect(parsed).toEqual(cells);
    });

    it.each(CORPUS.cases)(
        "writes back byte for byte: $name",
        ({ text, dumped }) => {
            const cells = parse(text);

            const written = dumps(cells);

            expect(written).toBe(dumped);
        },
    );

    it.each(CORPUS.cases)("survives a round trip: $name", ({ text }) => {
        const cells = parse(text);
        const written = dumps(cells);

        const readBack = parse(written);
        const writtenAgain = dumps(readBack);

        expect(writtenAgain).toBe(written);
    });
});

describe("the story text of a document", () => {
    it.each([
        {
            words: "within a cell",
            text: "<!-- cell: markdown -->\n\nShe saw the door.\n",
            startWordIdx: 2,
            endWordIdx: 3,
            storyText: "the door.",
        },
        {
            words: "of one word",
            text: "<!-- cell: markdown -->\n\nShe saw the door.\n",
            startWordIdx: 0,
            endWordIdx: 0,
            storyText: "She",
        },
        {
            words: "across paragraphs of a cell",
            text: "<!-- cell: markdown -->\n\nShe saw the door.\n\nHe heard the bell.\n",
            startWordIdx: 2,
            endWordIdx: 5,
            storyText: "the door.\n\nHe heard",
        },
        {
            words: "across markdown cells",
            text: "<!-- cell: markdown -->\n\nShe saw the door.\n\n<!-- cell: markdown -->\n\nHe heard the bell.\n",
            startWordIdx: 3,
            endWordIdx: 5,
            storyText: "door.\n\nHe heard",
        },
        {
            words: "past cells other than markdown, which hold no story words",
            text: '<!-- cell: chapter title="One Night" -->\n\n<!-- cell: markdown -->\n\nShe saw the door.\n\n<!-- cell: note -->\n\nNot a story word.\n\n<!-- cell: markdown -->\n\nHe heard the bell.\n',
            startWordIdx: 4,
            endWordIdx: 4,
            storyText: "He",
        },
        {
            words: "around a run without a letter or a digit, which is not a word",
            text: "<!-- cell: markdown -->\n\nShe — saw 2 doors.\n",
            startWordIdx: 0,
            endWordIdx: 2,
            storyText: "She — saw 2",
        },
        {
            words: "after a run of letters outside ascii alone, which is not a word",
            text: "<!-- cell: markdown -->\n\nShe saw é café.\n",
            startWordIdx: 2,
            endWordIdx: 2,
            storyText: "café.",
        },
        {
            words: "after the words of a comment in a markdown cell, which are story words",
            text: "<!-- cell: markdown -->\n\nShe saw <!-- a note --> the door.\n",
            startWordIdx: 4,
            endWordIdx: 5,
            storyText: "the door.",
        },
        {
            words: "starting past the end",
            text: "<!-- cell: markdown -->\n\nShe saw the door.\n",
            startWordIdx: 10,
            endWordIdx: 12,
            storyText: "",
        },
        {
            words: "running past the end",
            text: "<!-- cell: markdown -->\n\nShe saw the door.\n",
            startWordIdx: 2,
            endWordIdx: 12,
            storyText: "the door.",
        },
    ])(
        "is the text the story words $words cover",
        ({ text, startWordIdx, endWordIdx, storyText }) => {
            const document = new Document(text);

            const textCovered = document.storyText(startWordIdx, endWordIdx);

            expect(textCovered).toBe(storyText);
        },
    );
});
