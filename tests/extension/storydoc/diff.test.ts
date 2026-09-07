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

    it("names a cell the second has and the first has not, and where it stands", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW),
                AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
            ),
        ).toEqual([
            { whatHappened: "cellAdded", cellId: "c2", atCellIndex: 1 },
        ]);
    });

    it("names a cell the first has and the second has not", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
                AuthorDocument.fromText(HE_HEARD),
            ),
        ).toEqual([{ whatHappened: "cellDeleted", cellId: "c1" }]);
    });

    it("says nothing when the same cells stand in a different order", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
                AuthorDocument.fromText(HE_HEARD + "\n" + SHE_SAW),
            ),
        ).toEqual([]);
    });

    it("says where a cell's markdown differs, what goes and what comes", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW),
                AuthorDocument.fromText(
                    '<!-- cell: markdown id="c1" -->\n\nShe opened the door.\n',
                ),
            ),
        ).toEqual([
            {
                whatHappened: "cellMarkdownEdited",
                cellId: "c1",
                editedFromOffsetInCell: 4,
                charactersRemoved: 3,
                insertedText: "opened",
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
                whatHappened: "cellMarkdownEdited",
                cellId: "c1",
                editedFromOffsetInCell: 1,
                charactersRemoved: 0,
                insertedText: "lowly, S",
            },
        ]);
    });

    it("names an attribute written, changed, or missing from the second", () => {
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
                whatHappened: "cellAttributeEdited",
                cellId: "c1",
                attributeName: "title",
                attributeValueNow: "Two",
            },
            {
                whatHappened: "cellAttributeEdited",
                cellId: "c1",
                attributeName: "folded",
                attributeValueNow: undefined,
            },
            {
                whatHappened: "cellAttributeEdited",
                cellId: "c1",
                attributeName: "printed",
                attributeValueNow: "no",
            },
        ]);
    });

    it("says all of it at once when the two differ in several ways", () => {
        expect(
            diff(
                AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
                AuthorDocument.fromText(
                    '<!-- cell: markdown id="c2" title="Bells" -->\n\nHe heard the bell.\n' +
                        '\n<!-- cell: markdown id="c3" -->\n\nShe waited.\n',
                ),
            ),
        ).toEqual([
            { whatHappened: "cellDeleted", cellId: "c1" },
            {
                whatHappened: "cellAttributeEdited",
                cellId: "c2",
                attributeName: "title",
                attributeValueNow: "Bells",
            },
            { whatHappened: "cellAdded", cellId: "c3", atCellIndex: 1 },
        ]);
    });
});
