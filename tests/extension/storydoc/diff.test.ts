import { describe, expect, it } from "vitest";

import { AuthorDocDiff } from "../../../extension/library/storydoc/diff";
import { Document } from "../../../extension/library/storydoc/storydoc";

const SHE_SAW = '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n';
const HE_HEARD = '<!-- cell: markdown id="c2" -->\n\nHe heard the bell.\n';
const THE_CHAPTER = '<!-- cell: chapter id="c0" title="One" -->\n';
const THE_STORY = THE_CHAPTER + "\n" + SHE_SAW + "\n" + HE_HEARD;

function theDifferenceBetween(lhsText: string, rhsText: string): AuthorDocDiff {
    return AuthorDocDiff.diff(
        new Document(lhsText),
        new Document(rhsText),
    );
}

describe("diff — what would have to change to turn one document into the other", () => {
    it("says nothing about two documents written the same", () => {
        expect(theDifferenceBetween(SHE_SAW, SHE_SAW).empty()).toBe(true);
    });
});

describe("inverting a difference", () => {
    it("leaves a difference that says nothing saying nothing", () => {
        expect(theDifferenceBetween(SHE_SAW, SHE_SAW).invert().empty()).toBe(
            true,
        );
    });
});

function turningOneIntoTheOther(lhsText: string, rhsText: string): void {
    const lhs = new Document(lhsText);
    const rhs = new Document(rhsText);
    const change = AuthorDocDiff.diff(lhs, rhs);

    expect(change.applyTheDiff(lhs).text).toEqual(rhs.text);
    expect(change.invert().applyTheDiff(rhs).text).toEqual(lhs.text);
}

describe("applying a difference to a document", () => {
    it("leaves a document alone when the difference says nothing", () => {
        turningOneIntoTheOther(THE_STORY, THE_STORY);
    });

    it("writes a word one document has in place of the word the other has", () => {
        turningOneIntoTheOther(
            SHE_SAW,
            '<!-- cell: markdown id="c1" -->\n\nShe opened the door.\n',
        );
    });

    it("writes a character typed at the end of a cell", () => {
        turningOneIntoTheOther(
            SHE_SAW,
            '<!-- cell: markdown id="c1" -->\n\nShe saw the door.!\n',
        );
    });

    it("puts in a cell one document has and the other has not", () => {
        turningOneIntoTheOther(SHE_SAW, SHE_SAW + "\n" + HE_HEARD);
    });

    it("puts a cell back where it stood, not at the end", () => {
        turningOneIntoTheOther(
            SHE_SAW + "\n" + HE_HEARD,
            SHE_SAW + "\n" + THE_CHAPTER + "\n" + HE_HEARD,
        );
    });

    it("takes out a cell one document has and the other has not", () => {
        turningOneIntoTheOther(THE_STORY, THE_CHAPTER + "\n" + HE_HEARD);
    });

    it("writes back a cell taken out with the attributes it was written with", () => {
        turningOneIntoTheOther(THE_STORY, SHE_SAW + "\n" + HE_HEARD);
    });

    it("empties a cell of its text without taking it out of the document", () => {
        turningOneIntoTheOther(SHE_SAW, '<!-- cell: markdown id="c1" -->\n');
    });

    it("puts cells back in the order they stood in", () => {
        turningOneIntoTheOther(
            THE_STORY,
            HE_HEARD + "\n" + THE_CHAPTER + "\n" + SHE_SAW,
        );
    });

    it("moves one cell of many past the others", () => {
        turningOneIntoTheOther(
            SHE_SAW + "\n" + HE_HEARD + "\n" + THE_CHAPTER,
            THE_CHAPTER + "\n" + SHE_SAW + "\n" + HE_HEARD,
        );
    });

    it("writes, changes and takes away attributes", () => {
        turningOneIntoTheOther(
            '<!-- cell: chapter id="c1" title="One" folded="true" -->\n',
            '<!-- cell: chapter id="c1" title="Two" printed="no" -->\n',
        );
    });

    it("writes a cell as the kind the other document has it", () => {
        turningOneIntoTheOther(SHE_SAW, SHE_SAW.replace("markdown", "note"));
    });

    it("writes into a document that has no cells at all", () => {
        turningOneIntoTheOther("", SHE_SAW + "\n" + HE_HEARD);
    });

    it("writes every kind of change at once", () => {
        turningOneIntoTheOther(
            THE_STORY,
            '<!-- cell: chapter id="c0" title="Two" folded="true" -->\n' +
                "\n" +
                '<!-- cell: note id="c2" -->\n\nHe heard a bell.\n' +
                "\n" +
                '<!-- cell: markdown id="c3" -->\n\nShe waited.\n',
        );
    });
});
