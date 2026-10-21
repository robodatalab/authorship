import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { Document } from "../../../extension/library/storydoc/storydoc";
import {
    SalientConceptCell,
    SalientConceptReference,
} from "../../../extension/library/storydoc/cells/salient_concept_cell";
import { StoryWordRange } from "../../../extension/library/storydoc/cells/story_word_range";
import {
    StoryTextSpan,
    StoryWord,
    StoryWordsIterator,
} from "../../../extension/library/storydoc/iterators/story_words_iterator";
import { parse } from "../../../extension/library/storydoc/parser";

interface CorpusCase {
    name: string;
    text: string;
    cells: { kind: string; source: string; id: string }[];
    dumped: string;
}

const CORPUS: { cases: CorpusCase[] } = JSON.parse(
    readFileSync(join(__dirname, "../../storydoc_corpus.json"), "utf-8"),
);

describe("the shared corpus — the same documents server/storydoc/parser.py reads", () => {
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
            const document = new Document(text);

            const written = document.text;

            expect(written).toBe(dumped);
        },
    );

    it.each(CORPUS.cases)("survives a round trip: $name", ({ text }) => {
        const document = new Document(text);
        const written = document.text;

        const readBack = new Document(written);
        const writtenAgain = readBack.text;

        expect(writtenAgain).toBe(written);
    });
});

describe("a salient concept's references", () => {
    it("are read with their ids", () => {
        const document = new Document(
            '<!-- cell: salient-concept id="k1" title="Door" words="r1:2-3, r2:0-1" -->\n',
        );

        const [salientConcept] = document.cells;

        expect(salientConcept).toMatchObject({
            references: [
                new SalientConceptReference("r1", new StoryWordRange(2, 3)),
                new SalientConceptReference("r2", new StoryWordRange(0, 1)),
            ],
        });
    });

    it("are given an id when written without one", () => {
        vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
            "3f1c0e2a-0000-4000-8000-000000000001",
        );
        const document = new Document(
            '<!-- cell: salient-concept id="k1" title="Door" words="2-3" -->\n',
        );

        const [salientConcept] = document.cells;

        expect(salientConcept).toMatchObject({
            references: [
                new SalientConceptReference(
                    "3f1c0e2a-0000-4000-8000-000000000001",
                    new StoryWordRange(2, 3),
                ),
            ],
        });
    });

    it("are written with their ids", () => {
        const salientConcept = new SalientConceptCell(
            "Door",
            [
                new SalientConceptReference("r1", new StoryWordRange(2, 3)),
                new SalientConceptReference("r2", new StoryWordRange(0, 1)),
            ],
            "",
            false,
            null,
            "k1",
        );

        const written = Document.fromCells([salientConcept]).text;

        expect(written).toBe(
            '<!-- cell: salient-concept id="k1" title="Door" words="r1:2-3, r2:0-1" -->\n',
        );
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
            const storyWords = new StoryWordsIterator(document);
            const range = new StoryWordRange(startWordIdx, endWordIdx);

            const textCovered = storyWords.text(range);

            expect(textCovered).toBe(storyText);
        },
    );
});

function storyWhereSheSaw(): Document {
    return new Document(
        [
            '<!-- cell: chapter title="One" id="c1" -->',
            "",
            '<!-- cell: markdown id="c2" -->',
            "",
            "She saw the door.",
            "",
            '<!-- cell: note id="n1" -->',
            "",
            "<!--\nNot a story word.\n-->",
            "",
            '<!-- cell: markdown id="c3" -->',
            "",
            "He heard the bell.",
            "",
        ].join("\n"),
    );
}

describe("the story's words", () => {
    it("are the words of the markdown cells, numbered across them", () => {
        const storyWords = new StoryWordsIterator(storyWhereSheSaw());

        const words = Array.from(storyWords, (word) => word.text);

        expect(words).toEqual([
            "She",
            "saw",
            "the",
            "door.",
            "He",
            "heard",
            "the",
            "bell.",
        ]);
    });

    it("know where in their cell they stand", () => {
        const storyWords = new StoryWordsIterator(storyWhereSheSaw());

        const words = Array.from(storyWords);

        expect(words[5]).toEqual(new StoryWord(5, "c3", "heard", 3, 8));
    });
});

describe("the text a range of story words covers", () => {
    it("is one span in every cell the range reaches", () => {
        const storyWords = new StoryWordsIterator(storyWhereSheSaw());
        const range = new StoryWordRange(2, 5);

        const spans = storyWords.spans(range);

        expect(spans).toEqual([
            new StoryTextSpan("c2", 8, 17),
            new StoryTextSpan("c3", 0, 8),
        ]);
    });
});

describe("the story words a selection covers", () => {
    it("are every word the selection touches in its cell", () => {
        const storyWords = new StoryWordsIterator(storyWhereSheSaw());

        const range = storyWords.rangeBetween("c3", 4, 10);

        expect(range).toEqual(new StoryWordRange(5, 6));
    });

    it("are none when the selection touches no word", () => {
        const storyWords = new StoryWordsIterator(storyWhereSheSaw());

        const range = storyWords.rangeBetween("c1", 0, 3);

        expect(range).toBeNull();
    });
});
