import { describe, expect, it } from "vitest";

import { AuthorDocument } from "../../../extension/vscode_runtime/storydoc/model";
import { WordCounter } from "../../../extension/vscode_runtime/storydoc/word_counter";

const A_STORY_IN_TWO_PARTS = `
<!-- cell: part title="The Morning" id="p1" -->

<!-- cell: chapter title="Waking" id="c1" -->

<!-- cell: markdown id="m1" -->

She saw the door.

<!-- cell: markdown id="m2" -->

He heard the bell — twice.

<!-- cell: chapter title="Breakfast" id="c2" -->

<!-- cell: markdown id="m3" -->

Toast.

<!-- cell: part title="The Evening" id="p2" -->

<!-- cell: chapter title="Drinks" id="c3" -->

<!-- cell: markdown id="m4" -->

They drank.
`;

function counterOver(text: string): WordCounter {
    const counter = new WordCounter();
    counter.synchronize(AuthorDocument.fromText(text.replace(/^\n/, "")));
    return counter;
}

describe("WordCounter — the words of a story", () => {
    it("counts every markdown cell into the document", () => {
        expect(counterOver(A_STORY_IN_TWO_PARTS).wordsInTheDocument).toBe(12);
    });

    it("counts the chapters a markdown cell stands in", () => {
        const counter = counterOver(A_STORY_IN_TWO_PARTS);
        expect(counter.wordsInTheSection("c1")).toBe(9);
        expect(counter.wordsInTheSection("c2")).toBe(1);
        expect(counter.wordsInTheSection("c3")).toBe(2);
    });

    it("counts every chapter of a part into the part", () => {
        const counter = counterOver(A_STORY_IN_TWO_PARTS);
        expect(counter.wordsInTheSection("p1")).toBe(10);
        expect(counter.wordsInTheSection("p2")).toBe(2);
    });

    it("counts nothing for a cell that is not a section", () => {
        expect(
            counterOver(A_STORY_IN_TWO_PARTS).wordsInTheSection("m1"),
        ).toBeUndefined();
    });

    it("leaves out every kind of cell but markdown", () => {
        const counter = counterOver(`
<!-- cell: chapter title="One" id="c1" -->

<!-- cell: note id="n1" -->

Remember the door and the bell.

<!-- cell: markdown id="m1" -->

She saw the door.

<!-- cell: blurb id="b1" -->

A woman loses her name.
`);
        expect(counter.wordsInTheDocument).toBe(4);
        expect(counter.wordsInTheSection("c1")).toBe(4);
    });

    it("counts the words of a story nobody divided into sections", () => {
        const counter = counterOver(
            '<!-- cell: markdown id="m1" -->\n\nShe saw the door.\n',
        );
        expect(counter.wordsInTheDocument).toBe(4);
    });

    it("counts again once the author has written more", () => {
        const document = AuthorDocument.fromText(
            '<!-- cell: chapter title="One" id="c1" -->\n\n<!-- cell: markdown id="m1" -->\n\nShe saw the door.\n',
        );
        const counter = new WordCounter();
        counter.synchronize(document);

        document.cellWithId("m1")?.replaceMarkdown("She saw the door open.");
        counter.synchronize(document);

        expect(counter.wordsInTheDocument).toBe(5);
        expect(counter.wordsInTheSection("c1")).toBe(5);
    });

    it("forgets a section the author has deleted", () => {
        const document = AuthorDocument.fromText(
            '<!-- cell: chapter title="One" id="c1" -->\n\n<!-- cell: markdown id="m1" -->\n\nShe saw the door.\n',
        );
        const counter = new WordCounter();
        counter.synchronize(document);

        document.removeCell("c1");
        counter.synchronize(document);

        expect(counter.wordsInTheSection("c1")).toBeUndefined();
        expect(counter.wordsInTheDocument).toBe(4);
    });
});
