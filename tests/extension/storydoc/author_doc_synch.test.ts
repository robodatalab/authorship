import { describe, expect, it } from "vitest";

import {
    AuthorDocSynchronizer,
    type SynchronizedRepresentation,
} from "../../../extension/vscode_runtime/storydoc/author_doc_synch";
import { AuthorDocument } from "../../../extension/vscode_runtime/storydoc/model";

const SHE_SAW = '<!-- cell: markdown id="c1" -->\n\nShe saw the door.\n';
const SHE_SAW_NOTHING = '<!-- cell: markdown id="c1" -->\n\nShe  the door.\n';
const SLOWLY_SHE_SAW =
    '<!-- cell: markdown id="c1" -->\n\nSlowly, She saw the door.\n';
const HE_HEARD = '<!-- cell: markdown id="c2" -->\n\nHe heard the bell.\n';

function markOnSaw(): SynchronizedRepresentation {
    return {
        cellId: "c1",
        wordsInTheCell: "saw",
        startCharacterOffsetInCell: 4,
        endCharacterOffsetInCell: 7,
        isVisible: true,
    };
}

function markOnBell(): SynchronizedRepresentation {
    return {
        cellId: "c2",
        wordsInTheCell: "bell",
        startCharacterOffsetInCell: 13,
        endCharacterOffsetInCell: 17,
        isVisible: true,
    };
}

describe("a cell and text added to an empty document", () => {
    it("leaves a representation that was empty empty", () => {
        const representations: SynchronizedRepresentation[] = [];

        new AuthorDocSynchronizer(representations).synchronize(
            AuthorDocument.fromText(""),
            AuthorDocument.fromText(SHE_SAW),
        );

        expect(representations).toEqual([]);
    });
});

describe("the words a representation stands on being deleted", () => {
    it("leaves it where it was and out of sight", () => {
        const representations = [markOnSaw()];

        new AuthorDocSynchronizer(representations).synchronize(
            AuthorDocument.fromText(SHE_SAW),
            AuthorDocument.fromText(SHE_SAW_NOTHING),
        );

        expect(representations).toEqual([{ ...markOnSaw(), isVisible: false }]);
    });

    it("shows it again when those words are written back", () => {
        const representations = [markOnSaw()];
        const synchronizer = new AuthorDocSynchronizer(representations);

        synchronizer.synchronize(
            AuthorDocument.fromText(SHE_SAW),
            AuthorDocument.fromText(SHE_SAW_NOTHING),
        );
        synchronizer.synchronize(
            AuthorDocument.fromText(SHE_SAW_NOTHING),
            AuthorDocument.fromText(SHE_SAW),
        );

        expect(representations).toEqual([markOnSaw()]);
    });
});

describe("words written before the ones a representation stands on", () => {
    it("moves it to where those words now stand", () => {
        const representations = [markOnSaw()];

        new AuthorDocSynchronizer(representations).synchronize(
            AuthorDocument.fromText(SHE_SAW),
            AuthorDocument.fromText(SLOWLY_SHE_SAW),
        );

        expect(representations).toEqual([
            {
                ...markOnSaw(),
                startCharacterOffsetInCell: 12,
                endCharacterOffsetInCell: 15,
            },
        ]);
    });
});

describe("a cell added before the one a representation stands in", () => {
    it("leaves it on the same words", () => {
        const representations = [markOnSaw()];

        new AuthorDocSynchronizer(representations).synchronize(
            AuthorDocument.fromText(SHE_SAW),
            AuthorDocument.fromText(HE_HEARD + "\n" + SHE_SAW),
        );

        expect(representations).toEqual([markOnSaw()]);
    });
});

describe("the cell a representation stands in being deleted", () => {
    it("takes out of sight every representation of that cell, and no others", () => {
        const representations = [markOnSaw(), markOnBell()];

        new AuthorDocSynchronizer(representations).synchronize(
            AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
            AuthorDocument.fromText(HE_HEARD),
        );

        expect(representations).toEqual([
            { ...markOnSaw(), isVisible: false },
            markOnBell(),
        ]);
    });

    it("shows them again when the cell is put back", () => {
        const representations = [markOnSaw(), markOnBell()];
        const synchronizer = new AuthorDocSynchronizer(representations);

        synchronizer.synchronize(
            AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
            AuthorDocument.fromText(HE_HEARD),
        );
        synchronizer.synchronize(
            AuthorDocument.fromText(HE_HEARD),
            AuthorDocument.fromText(SHE_SAW + "\n" + HE_HEARD),
        );

        expect(representations).toEqual([markOnSaw(), markOnBell()]);
    });
});
