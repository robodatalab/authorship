import { describe, expect, it } from "vitest";

import { diff } from "../../../extension/vscode_runtime/storydoc/diff";
import { AuthorDocument } from "../../../extension/vscode_runtime/storydoc/model";

const SHE_SAW = '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n';
const HE_HEARD = '<!-- cell: markdown id="c2" -->\n\nHe heard the bell.\n';

describe("diff — what would have to change to turn one document into the other", () => {
    it("says nothing about two documents written the same", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW),
                AuthorDocument.fromText(SHE_SAW),
            ),
        ).toEqual([]);
    });

    it("says nothing when the same cells stand in a different order", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
                AuthorDocument.fromText(HE_HEARD + "\n" + SHE_SAW),
            ),
        ).toEqual([]);
    });

    it("gives a cell the second has and the first has not, with all of its text", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW),
                AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
            ),
        ).toEqual([
            {
                cellId: "c2",
                startCharacterIndexInRhsCell: 0,
                endCharacterIndexInRhsCell: 18,
                startCharacterIndexInLhsCell: 0,
                endCharacterIndexInLhsCell: 0,
                textInLhs: "",
                attributesChanged: { id: "c2" },
            },
        ]);
    });

    it("gives a cell the first has and the second has not, with all of its text", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
                AuthorDocument.fromText(HE_HEARD),
            ),
        ).toEqual([
            {
                cellId: "c1",
                startCharacterIndexInRhsCell: 0,
                endCharacterIndexInRhsCell: 0,
                startCharacterIndexInLhsCell: 0,
                endCharacterIndexInLhsCell: 17,
                textInLhs: "She saw the door.",
                attributesChanged: {},
            },
        ]);
    });

    it("says where a cell's markdown differs, in both of them", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW),
                AuthorDocument.fromText(
                    '<!-- cell: markdown id="c1" -->\n\nShe opened the door.\n',
                ),
            ),
        ).toEqual([
            {
                cellId: "c1",
                startCharacterIndexInRhsCell: 4,
                endCharacterIndexInRhsCell: 10,
                startCharacterIndexInLhsCell: 4,
                endCharacterIndexInLhsCell: 7,
                textInLhs: "saw",
                attributesChanged: {},
            },
        ]);
    });

    it("reads the difference from the first character that differs to the last", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW),
                AuthorDocument.fromText(
                    '<!-- cell: markdown id="c1" -->\n\nSlowly, She saw the door.\n',
                ),
            ),
        ).toEqual([
            {
                cellId: "c1",
                startCharacterIndexInRhsCell: 1,
                endCharacterIndexInRhsCell: 9,
                startCharacterIndexInLhsCell: 1,
                endCharacterIndexInLhsCell: 1,
                textInLhs: "",
                attributesChanged: {},
            },
        ]);
    });

    it("gives every attribute written, changed, or missing from the second", () => {
        expect(
            diff(
                AuthorDocument.fromText(
                    '<!-- cell: chapter id="c1" title="One" folded="true" -->\n',
                ),
                AuthorDocument.fromText(
                    '<!-- cell: chapter id="c1" title="Two" printed="no" -->\n',
                ),
            ),
        ).toEqual([
            {
                cellId: "c1",
                startCharacterIndexInRhsCell: 0,
                endCharacterIndexInRhsCell: 0,
                startCharacterIndexInLhsCell: 0,
                endCharacterIndexInLhsCell: 0,
                textInLhs: "",
                attributesChanged: {
                    title: "Two",
                    folded: undefined,
                    printed: "no",
                },
            },
        ]);
    });

    it("gives one difference per cell, however many ways the two differ", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
                AuthorDocument.fromText(
                    '<!-- cell: markdown id="c2" title="Bells" -->\n\nHe heard a bell.\n',
                ),
            ),
        ).toEqual([
            {
                cellId: "c1",
                startCharacterIndexInRhsCell: 0,
                endCharacterIndexInRhsCell: 0,
                startCharacterIndexInLhsCell: 0,
                endCharacterIndexInLhsCell: 17,
                textInLhs: "She saw the door.",
                attributesChanged: {},
            },
            {
                cellId: "c2",
                startCharacterIndexInRhsCell: 9,
                endCharacterIndexInRhsCell: 10,
                startCharacterIndexInLhsCell: 9,
                endCharacterIndexInLhsCell: 12,
                textInLhs: "the",
                attributesChanged: { title: "Bells" },
            },
        ]);
    });
});
