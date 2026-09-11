import { describe, expect, it } from "vitest";

import {
    AuthorDocCellDiff,
    AuthorDocDiff,
} from "../../../extension/vscode_runtime/storydoc/diff";
import { ImmutableAuthorDocument } from "../../../extension/vscode_runtime/storydoc/model";

const SHE_SAW = '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n';
const HE_HEARD = '<!-- cell: markdown id="c2" -->\n\nHe heard the bell.\n';
const THE_CHAPTER = '<!-- cell: chapter id="c0" title="One" -->\n';
const THE_STORY = THE_CHAPTER + "\n" + SHE_SAW + "\n" + HE_HEARD;

function theDifferenceBetween(lhsText: string, rhsText: string): AuthorDocDiff {
    return AuthorDocDiff.diff(
        ImmutableAuthorDocument.fromText(lhsText),
        ImmutableAuthorDocument.fromText(rhsText),
    );
}

describe("diff — what would have to change to turn one document into the other", () => {
    it("says nothing about two documents written the same", () => {
        expect(theDifferenceBetween(SHE_SAW, SHE_SAW).empty()).toBe(true);
    });

    it("gives the order the cells stand in when the same cells stand in another", () => {
        expect(
            theDifferenceBetween(
                SHE_SAW + "\n" + HE_HEARD,
                HE_HEARD + "\n" + SHE_SAW,
            ),
        ).toEqual(new AuthorDocDiff([], ["c1", "c2"], ["c2", "c1"]));
    });

    it("says nothing of the order when the cells stand as they stood", () => {
        expect(
            theDifferenceBetween(
                SHE_SAW,
                '<!-- cell: markdown id="c1" -->\n\nShe saw the gate.\n',
            ).cellIdsInRhs,
        ).toBeUndefined();
    });

    it("speaks up when a cell is of one kind in the first and another in the second", () => {
        expect(
            theDifferenceBetween(
                SHE_SAW,
                SHE_SAW.replace("markdown", "disclaimer"),
            ).cells,
        ).toEqual([
            new AuthorDocCellDiff(
                "c1",
                17,
                {
                    kind: "markdown",
                    textWhereTheyDiffer: "",
                    attributesWhereTheyDiffer: {},
                },
                {
                    kind: "disclaimer",
                    textWhereTheyDiffer: "",
                    attributesWhereTheyDiffer: {},
                },
            ),
        ]);
    });

    it("gives a cell the second has and the first has not, with all it is written with", () => {
        expect(
            theDifferenceBetween(SHE_SAW, SHE_SAW + "\n" + HE_HEARD),
        ).toEqual(
            new AuthorDocDiff(
                [
                    new AuthorDocCellDiff(
                        "c2",
                        0,
                        {
                            kind: undefined,
                            textWhereTheyDiffer: "",
                            attributesWhereTheyDiffer: {},
                        },
                        {
                            kind: "markdown",
                            textWhereTheyDiffer: "He heard the bell.",
                            attributesWhereTheyDiffer: { id: "c2" },
                        },
                    ),
                ],
                ["c1"],
                ["c1", "c2"],
            ),
        );
    });

    it("gives a cell the first has and the second has not, with all it was written with", () => {
        expect(
            theDifferenceBetween(SHE_SAW + "\n" + HE_HEARD, HE_HEARD).cells,
        ).toEqual([
            new AuthorDocCellDiff(
                "c1",
                0,
                {
                    kind: "markdown",
                    textWhereTheyDiffer: "She saw the door.",
                    attributesWhereTheyDiffer: { id: "c1" },
                },
                {
                    kind: undefined,
                    textWhereTheyDiffer: "",
                    attributesWhereTheyDiffer: {},
                },
            ),
        ]);
    });

    it("tells a cell emptied of its text from a cell taken out of the document", () => {
        expect(
            theDifferenceBetween(SHE_SAW, '<!-- cell: markdown id="c1" -->\n')
                .cells[0].inRhs.kind,
        ).toEqual("markdown");
    });

    it("says where a cell's markdown differs, in both of them", () => {
        expect(
            theDifferenceBetween(
                SHE_SAW,
                '<!-- cell: markdown id="c1" -->\n\nShe opened the door.\n',
            ).cells,
        ).toEqual([
            new AuthorDocCellDiff(
                "c1",
                4,
                {
                    kind: "markdown",
                    textWhereTheyDiffer: "saw",
                    attributesWhereTheyDiffer: {},
                },
                {
                    kind: "markdown",
                    textWhereTheyDiffer: "opened",
                    attributesWhereTheyDiffer: {},
                },
            ),
        ]);
    });

    it("reads the difference from the first character that differs to the last", () => {
        const cellDiff = theDifferenceBetween(
            SHE_SAW,
            '<!-- cell: markdown id="c1" -->\n\nSlowly, She saw the door.\n',
        ).cells[0];

        expect(cellDiff.theyDifferFromCharacter).toBe(1);
        expect(cellDiff.theyDifferToCharacterInLhs).toBe(1);
        expect(cellDiff.theyDifferToCharacterInRhs).toBe(9);
        expect(cellDiff.inRhs.textWhereTheyDiffer).toBe("lowly, S");
    });

    it("gives every attribute written, changed, or missing from the second", () => {
        expect(
            theDifferenceBetween(
                '<!-- cell: chapter id="c1" title="One" folded="true" -->\n',
                '<!-- cell: chapter id="c1" title="Two" printed="no" -->\n',
            ).cells,
        ).toEqual([
            new AuthorDocCellDiff(
                "c1",
                0,
                {
                    kind: "chapter",
                    textWhereTheyDiffer: "",
                    attributesWhereTheyDiffer: {
                        title: "One",
                        folded: "true",
                        printed: undefined,
                    },
                },
                {
                    kind: "chapter",
                    textWhereTheyDiffer: "",
                    attributesWhereTheyDiffer: {
                        title: "Two",
                        folded: undefined,
                        printed: "no",
                    },
                },
            ),
        ]);
    });

    it("gives one difference per cell, however many ways the two differ", () => {
        expect(
            theDifferenceBetween(
                SHE_SAW + "\n" + HE_HEARD,
                '<!-- cell: markdown id="c2" title="Bells" -->\n\nHe heard a bell.\n',
            ).cells.map((cellDiff) => cellDiff.cellId),
        ).toEqual(["c1", "c2"]);
    });
});

describe("inverting a difference", () => {
    it("turns each cell round, and the order they stand in", () => {
        const change = theDifferenceBetween(THE_STORY, HE_HEARD + SHE_SAW);

        expect(change.invert()).toEqual(
            theDifferenceBetween(HE_HEARD + SHE_SAW, THE_STORY),
        );
    });

    it("leaves a difference that says nothing saying nothing", () => {
        expect(theDifferenceBetween(SHE_SAW, SHE_SAW).invert().empty()).toBe(
            true,
        );
    });
});

function turningOneIntoTheOther(lhsText: string, rhsText: string): void {
    const lhs = ImmutableAuthorDocument.fromText(lhsText);
    const rhs = ImmutableAuthorDocument.fromText(rhsText);
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
