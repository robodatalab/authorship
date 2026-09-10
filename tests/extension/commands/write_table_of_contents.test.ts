import { beforeEach, describe, expect, it } from "vitest";

import { WriteTableOfContentsCommand } from "../../../extension/vscode_runtime/commands/write_table_of_contents";
import { forgetWhatTheEditorDid, openStory } from "./open_story";

const A_STORY_WITH_A_CONTENTS_CELL = `
<!-- cell: contents id="toc" -->

<!-- cell: chapter title="The Door" id="c1" -->

<!-- cell: markdown id="c2" -->

She saw the door.

<!-- cell: chapter title="The Bell" id="c3" -->
`;

beforeEach(forgetWhatTheEditorDid);

describe("WriteTableOfContentsCommand — writes the table of contents", () => {
    it("lists the chapters, in the order they stand in", () => {
        const session = openStory(A_STORY_WITH_A_CONTENTS_CELL);

        new WriteTableOfContentsCommand().invoke(session, { cellId: "toc" });

        expect(session.document.cells[0].source).toBe(
            "1. The Door\n1. The Bell",
        );
    });

    it("writes an untitled chapter as one", () => {
        const session = openStory(
            '<!-- cell: contents id="toc" -->\n\n<!-- cell: chapter id="c1" -->\n',
        );

        new WriteTableOfContentsCommand().invoke(session, { cellId: "toc" });

        expect(session.document.cells[0].source).toBe("1. Untitled");
    });

    it("lists a part above the chapters written under it", () => {
        const session = openStory(`
<!-- cell: contents id="toc" -->

<!-- cell: part title="Book One" id="p1" -->

<!-- cell: chapter title="The Door" id="c1" -->

<!-- cell: part title="Book Two" id="p2" -->

<!-- cell: chapter title="The Bell" id="c2" -->
`);

        new WriteTableOfContentsCommand().invoke(session, { cellId: "toc" });

        expect(session.document.cells[0].source).toBe(
            "1. Book One\n    1. The Door\n1. Book Two\n    1. The Bell",
        );
    });

    it("leaves out a part the book does not print, and the chapters under it stand alone", () => {
        const session = openStory(`
<!-- cell: contents id="toc" -->

<!-- cell: part title="Break" print="no" id="p1" -->

<!-- cell: chapter title="The Door" id="c1" -->
`);

        new WriteTableOfContentsCommand().invoke(session, { cellId: "toc" });

        expect(session.document.cells[0].source).toBe("1. The Door");
    });

    it("writes nothing into a story with no chapters", () => {
        const session = openStory('<!-- cell: contents id="toc" -->\n');

        new WriteTableOfContentsCommand().invoke(session, { cellId: "toc" });

        expect(session.document.cells[0].source).toBe("");
    });

    it("writes nothing when there is no cell at that index", () => {
        const session = openStory(A_STORY_WITH_A_CONTENTS_CELL);
        new WriteTableOfContentsCommand().invoke(session, {
            cellId: "nowhere",
        });
        expect(session.document.cells[0].source).toBe("");
    });
});
